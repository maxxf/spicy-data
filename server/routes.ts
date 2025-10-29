import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isUberEatsAdRelatedDescription } from "./db-storage";
import { setupAuth, isAuthenticated, isSuperAdmin, isBrandAdmin, getCurrentUser } from "./replitAuth";
import { insertPromotionSchema, insertPaidAdCampaignSchema, insertLocationSchema, insertLocationWeeklyFinancialSchema, onboardingMessageSchema, onboardingCompleteSchema, updateUserRoleSchema, createBrandAdminSchema, type AnalyticsFilters } from "@shared/schema";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

// Helper to safely calculate percentage change, returning null for invalid cases
function calculatePercentageChange(current: number, previous: number): number | null {
  if (previous === 0 || previous === null || previous === undefined) {
    return null; // Can't calculate change from zero or missing data
  }
  return ((current - previous) / previous) * 100;
}

function parseCSV(buffer: Buffer, platform?: string): any[] {
  // Strip UTF-8 BOM if present (0xEF, 0xBB, 0xBF)
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3);
  }
  
  // Auto-detect Uber Eats header row (some exports have 2 header rows, newer ones have 1)
  if (platform === "ubereats") {
    const firstLineParse = parse(buffer, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      to_line: 2, // Read first 2 lines to check
    });
    
    // Check if first row contains description text (like "as per", "whether it was", etc.)
    // If so, skip it and use line 2 as headers
    const firstRow = firstLineParse[0];
    const isDescriptionRow = firstRow && firstRow.length > 0 && 
      /\b(as per|whether it|either|mode of|platform from which)\b/i.test(String(firstRow[0]));
    
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: isDescriptionRow ? 2 : 1,
      bom: true, // Handle BOM in column headers
    });
  }
  
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // Handle BOM in column headers
  });
}

// Helper to normalize column names for flexible CSV parsing
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '');
}

function getColumnValue(row: any, ...possibleNames: string[]): string {
  // First try exact matches
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  
  // Then try normalized matches
  const normalizedRow: Record<string, any> = {};
  for (const key in row) {
    normalizedRow[normalizeColumnName(key)] = row[key];
  }
  
  for (const name of possibleNames) {
    const normalized = normalizeColumnName(name);
    if (normalizedRow[normalized] !== undefined && normalizedRow[normalized] !== null) {
      return normalizedRow[normalized];
    }
  }
  
  return '';
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  const distance = editDistance(shorter, longer);
  return (longer.length - distance) / longer.length;
}

// Special function for Grubhub: Match by address (Column G) with store_number fallback - NO AUTO-CREATION
async function findOrCreateLocationByAddress(
  clientId: string,
  locationName: string,
  platform: "grubhub",
  address?: string,
  storeNumber?: string
): Promise<string> {
  const allLocations = await storage.getLocationsByClient(clientId);
  
  // Strategy 1 (Primary): Match by normalized address to existing master locations (Column G)
  if (address) {
    const normalizedInputAddress = normalizeAddress(address);
    const locationByAddress = allLocations.find(l => 
      l.address && normalizeAddress(l.address) === normalizedInputAddress
    );
    if (locationByAddress) {
      // Update Grubhub name if not already set
      if (!locationByAddress.grubhubName) {
        await storage.updateLocation(locationByAddress.id, {
          grubhubName: locationName
        });
      }
      return locationByAddress.id;
    }
  }

  // Strategy 2 (Fallback): Match by store_number to storeId in master list (Column C)
  // Note: Grubhub data sometimes has incorrect store_number, so this is lower confidence
  if (storeNumber) {
    // Trim and clean the store number (remove quotes, extra spaces)
    const cleanStoreNumber = storeNumber.replace(/['"]/g, '').trim();
    let locationByStoreNumber = allLocations.find(l => {
      if (!l.storeId) return false;
      // Extract the code portion from storeId (e.g., "NV008 Las Vegas Sahara" → "NV008")
      const storeIdCode = l.storeId.split(' ')[0];
      return storeIdCode === cleanStoreNumber;
    });
    
    // If no exact match and store number is numeric only, try matching with leading zeros removed
    // e.g., "121" should match "NV121", "8" should match "NV008"
    if (!locationByStoreNumber && /^\d+$/.test(cleanStoreNumber)) {
      locationByStoreNumber = allLocations.find(l => {
        if (!l.storeId) return false;
        const storeIdCode = l.storeId.split(' ')[0];
        // Extract numeric portion from storeIdCode
        const numericMatch = storeIdCode.match(/(\d+)$/);
        if (!numericMatch) return false;
        const numericPortion = numericMatch[1];
        // Compare with leading zeros removed (e.g., "008" → "8", "121" → "121")
        return parseInt(numericPortion, 10).toString() === cleanStoreNumber;
      });
    }
    
    if (locationByStoreNumber) {
      // Update Grubhub name if not already set
      if (!locationByStoreNumber.grubhubName) {
        await storage.updateLocation(locationByStoreNumber.id, {
          grubhubName: locationName
        });
      }
      return locationByStoreNumber.id;
    }
  }

  // NO FUZZY MATCHING - NO AUTO-CREATION
  // If we didn't find a match, return the unmapped bucket
  return getUnmappedLocationBucket(clientId);
}

// Helper: Extract code from parentheses (e.g., "Capriotti's (IA069)" or "(az-104)" → "IA069" or "az-104")
function extractCodeFromParentheses(text: string): string | null {
  const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
  return match ? match[1].trim() : null;
}

// Helper: Normalize address for matching (handle "St." vs "Street", whitespace, etc.)
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    // Remove suite/unit numbers (do this early, before other normalizations)
    .replace(/\s+(suite|ste|unit|apt|apartment|#)\s*[a-z0-9\-]+.*$/i, '')
    .replace(/\s+#\s*[a-z0-9\-]+.*$/i, '')  // Catch standalone "#123" patterns
    // Expand directional abbreviations (N/S/E/W)
    .replace(/\b([nsew])\b/g, (match, dir) => {
      const directions: Record<string, string> = { 'n': 'north', 's': 'south', 'e': 'east', 'w': 'west' };
      return directions[dir] || match;
    })
    // Normalize street type abbreviations
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bparkway\b/g, 'pkwy')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\bplace\b/g, 'pl')
    // Remove punctuation
    .replace(/[.,]/g, '')
    .trim(); // Final trim after removals
}

// Helper: Get or create the "Unmapped Locations" bucket for a client
async function getUnmappedLocationBucket(clientId: string): Promise<string> {
  const allLocations = await storage.getLocationsByClient(clientId);
  const unmappedBucket = allLocations.find(l => 
    l.canonicalName === "Unmapped Locations" && l.locationTag === "unmapped_bucket"
  );
  
  if (unmappedBucket) {
    return unmappedBucket.id;
  }
  
  // Create unmapped bucket if it doesn't exist
  const newBucket = await storage.createLocation({
    clientId,
    storeId: null,
    canonicalName: "Unmapped Locations",
    address: null,
    doorDashStoreKey: null,
    uberEatsStoreLabel: null,
    uberEatsName: null,
    doordashName: null,
    grubhubName: null,
    isVerified: true,
    locationTag: "unmapped_bucket",
  });
  
  return newBucket.id;
}

async function findOrCreateLocation(
  clientId: string,
  locationName: string,
  platform: "ubereats" | "doordash" | "grubhub",
  platformKey?: string
): Promise<string> {
  const allLocations = await storage.getLocationsByClient(clientId);
  
  // DoorDash: Check edge case store name mappings first
  if (platform === "doordash") {
    // Hardcoded edge cases for DoorDash store names that don't follow standard patterns
    const doordashEdgeCases: Record<string, string> = {
      "lewes": "DE027",
      "lewes, de": "DE027",
      "whitesburg": "AL100520",
      "whitesburg dr (medical district)": "AL100520",
      "chicago river west": "IL110507",
      "catclaw": "TX100444",
      "catclaw - abilene": "TX100444",
      "elkton": "MD013",
      "elkton, md": "MD013",
      "marlton": "NJ100518",
      "marlton, nj": "NJ100518",
    };
    
    const normalizedName = locationName.toLowerCase().trim();
    const edgeCaseStoreId = doordashEdgeCases[normalizedName];
    
    if (edgeCaseStoreId) {
      const locationByEdgeCase = allLocations.find(l => 
        l.storeId === edgeCaseStoreId || 
        l.storeId?.startsWith(edgeCaseStoreId + " ")
      );
      
      if (locationByEdgeCase) {
        // Update DoorDash display name if not set
        if (!locationByEdgeCase.doordashName) {
          await storage.updateLocation(locationByEdgeCase.id, {
            doordashName: locationName
          });
        }
        return locationByEdgeCase.id;
      }
    }
  }
  
  // DoorDash: Match Merchant Store ID (e.g., "IA069" or "8") to doorDashStoreKey (Column E)
  if (platform === "doordash" && platformKey) {
    // Try exact match first
    let locationByKey = allLocations.find(l => l.doorDashStoreKey === platformKey);
    
    // If no exact match and platformKey is numeric-only, try two fallback strategies:
    if (!locationByKey && /^\d+$/.test(platformKey)) {
      // Strategy 1: Match numeric portion with leading zeros removed (e.g., "8" → "NV008")
      locationByKey = allLocations.find(l => {
        if (!l.doorDashStoreKey) return false;
        // Extract numeric portion from doorDashStoreKey (e.g., "NV008" → "008")
        const keyMatch = l.doorDashStoreKey.match(/(\d+)$/);
        if (!keyMatch) return false;
        // Compare with leading zeros removed (e.g., "008" vs "8")
        const numericPortion = parseInt(keyMatch[1], 10).toString();
        return numericPortion === platformKey;
      });
      
      // Strategy 2: If numeric matching failed, try matching by store name against storeId
      // (handles cases like "467" → "NV900467" where numeric portions don't match)
      if (!locationByKey) {
        const normalizedLocationName = locationName.toLowerCase().trim();
        locationByKey = allLocations.find(l => {
          if (!l.canonicalName && !l.storeId) return false;
          // Try matching against the descriptive part of storeId (e.g., "NV008 Las Vegas Sahara" → "las vegas sahara")
          const nameToMatch = l.storeId || l.canonicalName;
          const parts = nameToMatch.split(' ');
          // Skip the first part (the code like "NV008") and check if remaining parts match
          const descriptivePart = parts.slice(1).join(' ').toLowerCase().trim();
          
          // Check if store name appears in the descriptive part
          return descriptivePart.includes(normalizedLocationName) || 
                 normalizedLocationName.includes(descriptivePart);
        });
        
      }
      
      // Strategy 3: If still no match, try exact match against doordashName
      // (handles cases where CSV only has store name like "Old Town" matching doordashName = "Old Town")
      if (!locationByKey) {
        const normalizedLocationName = locationName.toLowerCase().trim();
        locationByKey = allLocations.find(l => 
          l.doordashName && l.doordashName.toLowerCase().trim() === normalizedLocationName
        );
      }
    }
    
    if (locationByKey) {
      // Update DoorDash display name if not set
      if (!locationByKey.doordashName) {
        await storage.updateLocation(locationByKey.id, {
          doordashName: locationName
        });
      }
      return locationByKey.id;
    }
  }
  
  // Final fallback for DoorDash: Try exact match on doordashName even without platformKey
  // (handles simplified CSV format with only store name, no Merchant Store ID)
  if (platform === "doordash") {
    const normalizedLocationName = locationName.toLowerCase().trim();
    const locationByName = allLocations.find(l => 
      l.doordashName && l.doordashName.toLowerCase().trim() === normalizedLocationName
    );
    
    if (locationByName) {
      return locationByName.id;
    }
  }
  
  // Uber Eats: Extract code from Store Name (e.g., "Capriotti's (IA069)" → "IA069")
  // then match to uberEatsStoreLabel (Column E) by comparing codes
  if (platform === "ubereats") {
    // Try to extract code from parentheses first
    const extractedCode = extractCodeFromParentheses(locationName);
    
    // Normalize the code (from parentheses OR the raw locationName itself)
    const normalizedCsvCode = (extractedCode || locationName).trim().toUpperCase();
    
    // Match by comparing codes from both CSV and database
    const locationByCode = allLocations.find(l => {
      if (!l.uberEatsStoreLabel) return false;
      
      // Extract code from database value, handling both formats:
      // - "Capriotti's Sandwich Shop (NV008)" → "NV008"
      // - "NV008" → "NV008" (already just the code)
      const dbCode = extractCodeFromParentheses(l.uberEatsStoreLabel) || l.uberEatsStoreLabel;
      const normalizedDbCode = dbCode.trim().toUpperCase();
      
      return normalizedDbCode === normalizedCsvCode;
    });
    
    if (locationByCode) {
      // Update Uber Eats display name if not set
      if (!locationByCode.uberEatsName) {
        await storage.updateLocation(locationByCode.id, {
          uberEatsName: locationName
        });
      }
      return locationByCode.id;
    }
  }

  // NO FUZZY MATCHING - NO AUTO-CREATION
  // If we didn't find a match, return the unmapped bucket
  return getUnmappedLocationBucket(clientId);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      // If authentication is disabled or no user session, return null
      if (!req.user || !req.user.claims) {
        return res.json(null);
      }
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.json(null);
    }
  });

  // Protected API routes (require authentication)
  app.get("/api/clients", async (req, res) => {
    try {
      const clients = await storage.getAllClients();
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients", isAuthenticated, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const client = await storage.createClient({ name });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Management routes (super admin only)
  app.get("/api/users", isSuperAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/users/:id/role", isSuperAdmin, async (req, res) => {
    try {
      const validationResult = updateUserRoleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors
        });
      }

      const { role, clientId } = validationResult.data;
      const updated = await storage.updateUserRole(req.params.id, role, clientId);
      
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.delete("/api/users/:id", isSuperAdmin, async (req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      
      if (currentUser?.id === req.params.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const deleted = await storage.deleteUser(req.params.id);
      
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // PUBLIC Onboarding routes (no authentication required)
  app.post("/api/onboarding/start", async (req, res) => {
    try {
      const session = await storage.createOnboardingSession();
      res.json(session);
    } catch (error: any) {
      console.error("Error creating onboarding session:", error);
      res.status(500).json({ error: "Failed to create session. Please try again." });
    }
  });

  app.get("/api/onboarding/:sessionId", async (req, res) => {
    try {
      const session = await storage.getOnboardingSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      console.error("Error retrieving onboarding session:", error);
      res.status(500).json({ error: "Failed to retrieve session. Please try again." });
    }
  });

  app.post("/api/onboarding/:sessionId/message", async (req, res) => {
    try {
      const validationResult = onboardingMessageSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input",
          details: validationResult.error.errors
        });
      }

      const { message } = validationResult.data;

      const session = await storage.getOnboardingSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!process.env.OPENAI_API_KEY) {
        console.error("OpenAI API key not configured");
        return res.status(500).json({ error: "Service temporarily unavailable. Please try again later." });
      }

      const { OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const messages = session.messages || [];
      messages.push({ role: "user", content: message });

      const systemPrompt = `You are an onboarding assistant for a restaurant analytics platform. Your goal is to help new restaurant brands set up their account by collecting the following information:

1. Brand name and contact information
2. Which delivery platforms they use (Uber Eats, DoorDash, Grubhub)
3. List of all their restaurant locations (name and address)
4. Estimated Cost of Goods Sold percentage (COGS %)
5. Primary business goal: profitability optimization or topline growth

Be conversational, helpful, and guide them through the process step by step. Ask one thing at a time. When they provide location information, help them format it as a list with names and addresses.

When you have collected all the information, respond with a JSON object in this exact format:
{
  "complete": true,
  "data": {
    "brandName": "string",
    "contactEmail": "string",
    "platforms": ["ubereats", "doordash", "grubhub"],
    "locations": [{"name": "string", "address": "string"}],
    "cogsPercentage": 0.46,
    "primaryGoal": "profitability" | "topline_growth"
  }
}

Otherwise, just respond conversationally to continue gathering information.`;

      let completion;
      try {
        completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
        });
      } catch (openaiError: any) {
        console.error("OpenAI API error:", openaiError);
        return res.status(500).json({ 
          error: "Failed to get response from AI assistant. Please try again." 
        });
      }

      const assistantMessage = completion.choices[0].message.content || "";
      messages.push({ role: "assistant", content: assistantMessage });

      let collectedData = session.collectedData;
      let status = session.status;

      try {
        const jsonMatch = assistantMessage.match(/\{[\s\S]*"complete":\s*true[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.complete && parsed.data) {
            collectedData = parsed.data;
            status = "completed";
          }
        }
      } catch (e) {
      }

      const updated = await storage.updateOnboardingSession(req.params.sessionId, {
        messages,
        collectedData,
        status,
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error processing message:", error);
      res.status(500).json({ error: "An unexpected error occurred. Please try again." });
    }
  });

  app.post("/api/onboarding/:sessionId/complete", async (req, res) => {
    try {
      const validationResult = onboardingCompleteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid input",
          details: validationResult.error.errors
        });
      }

      const session = await storage.getOnboardingSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!session.collectedData) {
        return res.status(400).json({ error: "Onboarding not yet complete. Please finish the conversation first." });
      }

      const data = session.collectedData as any;

      const client = await storage.createClient({
        name: data.brandName,
        cogsPercentage: data.cogsPercentage,
        primaryGoal: data.primaryGoal,
        onboardingSessionId: session.id,
        onboardingCompletedAt: new Date(),
      });

      const locationIds: string[] = [];
      for (const loc of data.locations || []) {
        const location = await storage.createLocation({
          clientId: client.id,
          canonicalName: loc.name,
          address: loc.address,
          isVerified: false,
        });
        locationIds.push(location.id);
      }

      res.json({
        success: true,
        client,
        locationIds,
        email: data.contactEmail,
      });
    } catch (error: any) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ error: "Failed to complete onboarding. Please try again." });
    }
  });

  app.post("/api/upload", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { platform, clientId } = req.body;
      
      if (!platform || !clientId) {
        return res.status(400).json({ error: "Platform and clientId are required" });
      }

      const rows = parseCSV(req.file.buffer, platform);

      if (platform === "ubereats") {
        // NOTE: Uber Eats matching uses Store Name (e.g., "Capriotti's Sandwich Shop (IA069)")
        // which matches to Column E (uberEatsStoreLabel) in the master sheet
        // The CSV "Store ID" column is auxiliary data, not used for matching

        // Step 1: Collect unique locations and create them upfront
        const locationMap = new Map<string, string>();
        const uniqueLocations = new Set<string>(); // just store names
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
          if (locationName && locationName.trim() !== "") {
            uniqueLocations.add(locationName);
          }
        }
        
        // Batch create/find all locations by matching Store Name to uberEatsStoreLabel (Column E)
        for (const locationName of uniqueLocations) {
          const locationId = await findOrCreateLocation(clientId, locationName, "ubereats");
          locationMap.set(locationName, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertUberEatsTransaction[] = [];
        
        for (const row of rows) {
          // Skip rows without workflow ID (unique transaction identifier)
          const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id");
          if (!workflowId || workflowId.trim() === "") {
            continue;
          }

          // Skip rows without order ID
          const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
          if (!orderId || orderId.trim() === "") {
            continue;
          }

          const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
          const locationId = locationMap.get(locationName) || null;

          const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax")) || 0;
          const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0;

          transactions.push({
            clientId,
            locationId,
            orderId,
            workflowId,
            orderStatus: getColumnValue(row, "Order Status", "Order_Status", "order_status") || null,
            date: getColumnValue(row, "Order Date", "Date", "Order_Date", "order_date"),
            time: getColumnValue(row, "Order Accept Time", "Time", "Order_Accept_Time", "order_accept_time"),
            location: locationName,
            
            // Sales fields (updated methodology)
            salesExclTax,
            subtotal: salesExclTax + tax, // Calculate subtotal from sales + tax
            tax,
            
            // Fee fields
            deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "Delivery_Fee", "delivery_fee")) || 0,
            serviceFee: parseFloat(getColumnValue(row, "Service Fee", "Service_Fee", "service_fee")) || 0,
            platformFee: parseFloat(getColumnValue(row, "Marketplace Fee", "Platform_Fee", "Platform Fee", "marketplace_fee")) || 0,
            
            // Marketing/promotional fields (updated methodology)
            offersOnItems: parseFloat(getColumnValue(row, "Offers on items (incl. tax)", "Offers_on_items", "offers_on_items")) || 0,
            deliveryOfferRedemptions: parseFloat(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)", "Delivery_Offer_Redemptions", "delivery_offer_redemptions")) || 0,
            offerRedemptionFee: parseFloat(getColumnValue(row, "Offer Redemption Fee", "Offer_Redemption_Fee", "offer_redemption_fee")) || 0,
            marketingPromo: getColumnValue(row, "Marketing Promotion", "Marketing_Promo", "marketing_promotion") || null,
            marketingAmount: parseFloat(getColumnValue(row, "Marketing Adjustment", "Marketing_Amount", "marketing_adjustment")) || 0,
            
            // Other payments (Ad Spend, Credits, Fees, etc.)
            otherPayments: parseFloat(getColumnValue(row, "Other payments", "Other_payments", "other_payments")) || 0,
            otherPaymentsDescription: getColumnValue(row, "Other payments description", "Other_payments_description", "other_payments_description") || null,
            
            // Payout
            netPayout: parseFloat(getColumnValue(row, "Total payout ", "Total payout", "Net_Payout", "net_payout")) || 0,
            
            // Other
            customerRating: null,
          });
        }
        
        // Step 3: Deduplicate transactions by workflowId (unique transaction identifier)
        // since Uber Eats CSV can have multiple rows per workflow (item-level details)
        const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
        for (const txn of transactions) {
          const key = txn.workflowId;
          // Keep the last occurrence (most complete data row)
          uniqueTransactions.set(key, txn);
        }
        
        const deduplicatedTransactions = Array.from(uniqueTransactions.values());
        
        // Step 4: Insert deduplicated transactions in batch
        await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
        res.json({ success: true, rowsProcessed: deduplicatedTransactions.length });
        return;
      } else if (platform === "doordash") {
        // Helper to safely parse negative values (discounts/offers are negative in CSV)
        const parseNegativeFloat = (val: any) => {
          if (!val) return 0;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Step 1: Collect unique locations and create them upfront
        const locationMap = new Map<string, string>();
        const uniqueLocations = new Map<string, string | undefined>(); // name -> storeId
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
          const storeId = getColumnValue(row, "Merchant Store ID", "merchant_store_id", "Merchant_Store_ID") || undefined;
          if (locationName && locationName.trim() !== "") {
            uniqueLocations.set(locationName, storeId);
          }
        }
        
        // Batch create/find all locations
        for (const [locationName, storeId] of uniqueLocations) {
          const locationId = await findOrCreateLocation(clientId, locationName, "doordash", storeId);
          locationMap.set(locationName, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertDoordashTransaction[] = [];
        
        for (const row of rows) {
          // Skip rows without transaction ID (unique identifier)
          const transactionId = getColumnValue(row, "DoorDash transaction ID", "Transaction ID", "Transaction_ID", "transaction_id");
          if (!transactionId || transactionId.trim() === "") {
            continue;
          }

          const orderNumber = getColumnValue(row, "DoorDash order ID", "Order Number", "Order_Number", "order_number");
          if (!orderNumber || orderNumber.trim() === "") {
            continue;
          }

          // CRITICAL: Skip Storefront orders - only process Marketplace orders
          const channel = getColumnValue(row, "Channel", "channel");
          if (channel && channel.trim().toLowerCase() === "storefront") {
            continue;
          }

          const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
          const locationId = locationMap.get(locationName) || null;

          // Parse all financial columns
          const subtotal = parseNegativeFloat(getColumnValue(row, "Subtotal", "Order Subtotal", "Order_Subtotal", "order_subtotal"));
          const taxes = parseNegativeFloat(getColumnValue(row, "Subtotal tax passed to merchant", "Subtotal Tax Passed by DoorDash to Merchant", "Taxes", "taxes"));
          const commission = parseNegativeFloat(getColumnValue(row, "Commission", "commission"));
          const totalTips = parseNegativeFloat(getColumnValue(row, "Total Tips", "total_tips"));
          const marketingFees = parseNegativeFloat(getColumnValue(row, "Marketing fees | (including any applicable taxes)", "Marketing Fees | (Including any applicable taxes)", "other_payments"));
          const paymentProcessingFee = parseNegativeFloat(getColumnValue(row, "Payment Processing Fee", "payment_processing_fee"));
          const deliveryOrderFee = parseNegativeFloat(getColumnValue(row, "Delivery Order Fee", "delivery_order_fee"));
          const pickupOrderFee = parseNegativeFloat(getColumnValue(row, "Pickup Order Fee", "pickup_order_fee"));
          const errorCharge = parseNegativeFloat(getColumnValue(row, "Error Charge", "Error charges", "Error Charges", "error_charges"));

          // Parse marketing/promotional fields
          const offersOnItems = parseNegativeFloat(getColumnValue(
            row,
            "Customer discounts",
            "Customer discounts from marketing | (funded by you)",
            "Customer Discounts from Marketing | (Funded by You)",
            "Offers on items (incl. tax)",
            "offers_on_items"
          ));
          const deliveryOfferRedemptions = parseNegativeFloat(getColumnValue(
            row,
            "Customer discounts from marketing | (funded by DoorDash)",
            "Customer Discounts from Marketing | (Funded by DoorDash)",
            "Delivery Offer Redemptions (incl. tax)",
            "delivery_offer_redemptions"
          ));
          const marketingCredits = parseNegativeFloat(getColumnValue(
            row,
            "DoorDash marketing credit",
            "DoorDash Marketing Credit",
            "Marketing Credits",
            "marketing_credits"
          ));
          const thirdPartyContribution = parseNegativeFloat(getColumnValue(
            row,
            "Customer discounts from marketing | (funded by a third-party)",
            "Customer Discounts from Marketing | (Funded by a Third-party)",
            "Third-party Contribution",
            "third_party_contribution"
          ));
          
          // Calculate total marketing spend: ad fees + customer discounts - marketing credits
          // Marketing credits are CREDITS from DoorDash that reduce effective marketing spend
          const totalMarketingSpend = Math.abs(marketingFees) + 
            Math.abs(offersOnItems) + 
            Math.abs(deliveryOfferRedemptions) + 
            thirdPartyContribution -
            marketingCredits; // Subtract credits (they reduce spend)
          
          // Use the Net total from CSV directly (DoorDash calculates this correctly)
          const netTotal = parseNegativeFloat(getColumnValue(row, "Net total", "Net Total"));
          

          transactions.push({
            clientId,
            locationId,
            
            // Order identification
            transactionId: transactionId,
            orderNumber: orderNumber,
            transactionDate: getColumnValue(row, "Timestamp local time", "Timestamp local date", "Transaction Date", "Transaction_Date", "transaction_date"),
            storeLocation: locationName,
            
            // Status and channel filtering fields
            channel: getColumnValue(row, "Channel", "channel") || null,
            orderStatus: getColumnValue(row, "Final order status", "Order Status", "Order_Status", "order_status") || null,
            transactionType: getColumnValue(row, "Transaction type", "Transaction Type", "Transaction_Type", "transaction_type")?.trim() || null,
            
            // Sales metrics
            salesExclTax: parseNegativeFloat(getColumnValue(row, "Subtotal", "Sales (excl. tax)", "sales_excl_tax", "salesExclTax")),
            orderSubtotal: subtotal,
            taxes: taxes,
            
            // Fees and charges
            deliveryFees: parseNegativeFloat(getColumnValue(row, "Delivery Fees", "Delivery_Fees", "delivery_fees")),
            commission: Math.abs(commission),
            errorCharges: errorCharge,
            
            // Marketing/promotional fields (typically negative for discounts)
            offersOnItems,
            deliveryOfferRedemptions,
            marketingCredits,
            thirdPartyContribution,
            
            // Other payments (ad spend, credits, etc.)
            otherPayments: Math.abs(marketingFees),
            otherPaymentsDescription: marketingFees !== 0 
              ? (getColumnValue(row, "Description", "Other payments description", "other_payments_description") || "Marketing Fees")
              : null,
            
            // Marketing Spend: Auto-calculated sum of ad spend + customer discounts
            marketingSpend: totalMarketingSpend,
            
            // Payout (from CSV's Net total column)
            totalPayout: netTotal,
            netPayment: netTotal,
            
            // Source
            orderSource: getColumnValue(row, "Order Source", "Order_Source", "order_source") || null,
          });
        }
        
        // Step 3: Deduplicate transactions by transactionId (unique identifier)
        // DoorDash CSVs can have duplicate transaction IDs in the same file
        const uniqueTransactions = new Map<string, InsertDoordashTransaction>();
        for (const txn of transactions) {
          const key = txn.transactionId;
          // Keep the last occurrence (most complete data row)
          uniqueTransactions.set(key, txn);
        }
        
        const deduplicatedTransactions = Array.from(uniqueTransactions.values());
        
        // Step 4: Insert deduplicated transactions in batch
        await storage.createDoordashTransactionsBatch(deduplicatedTransactions);
        res.json({ success: true, rowsProcessed: deduplicatedTransactions.length });
        return;
      } else if (platform === "grubhub") {
        // Step 1: Collect unique locations and create them upfront
        // NOTE: For Grubhub, store_name is always "Capriotti's Sandwich Shop"
        // Use address as primary key, but include store_number for rows with missing addresses
        const locationMap = new Map<string, string>(); // key: addressKey, value: locationId
        const uniqueLocations = new Map<string, { locationName: string; address?: string; storeNumber?: string }>(); // addressKey -> {locationName, address, storeNumber}
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name");
          const address = getColumnValue(row, "street_address", "store_address", "Address", "Store_Address", "address") || undefined;
          const storeNumber = getColumnValue(row, "store_number", "Store_Number", "store number") || undefined;
          
          // Create unique key: use address if available, otherwise fall back to store_number
          // IMPORTANT: Skip rows with no address AND no store_number - they'll go to unmapped bucket
          const cleanStoreNumber = storeNumber?.replace(/['"]/g, '').trim() || '';
          
          // Only create addressKey if we have either address or store_number
          const addressKey = address 
            ? normalizeAddress(address) 
            : cleanStoreNumber 
            ? `store:${cleanStoreNumber}`
            : null; // null means unmapped
          
          if (locationName && locationName.trim() !== "" && addressKey) {
            // Store the first occurrence of each unique address/store combo
            if (!uniqueLocations.has(addressKey)) {
              uniqueLocations.set(addressKey, { locationName, address, storeNumber });
            }
          }
        }
        
        // Batch create/find all locations using address (primary) and store_number (fallback) for matching
        for (const [addressKey, { locationName, address, storeNumber }] of uniqueLocations) {
          const locationId = await findOrCreateLocationByAddress(clientId, locationName, "grubhub", address, storeNumber);
          locationMap.set(addressKey, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertGrubhubTransaction[] = [];
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name");
          
          // Skip rows without order number OR transaction ID
          const orderNumber = getColumnValue(row, "order_number", "Order_Id", "order number", "order_id");
          const transactionId = getColumnValue(row, "transaction_id", "Transaction_Id", "transaction id");
          if (!orderNumber || orderNumber.trim() === "" || !transactionId || transactionId.trim() === "") {
            continue;
          }

          // Reconstruct the same addressKey used for deduplication
          const address = getColumnValue(row, "street_address", "store_address", "Address", "Store_Address", "address") || undefined;
          const storeNumber = getColumnValue(row, "store_number", "Store_Number", "store number") || undefined;
          const cleanStoreNumber = storeNumber?.replace(/['"]/g, '').trim() || '';
          
          // Match the logic from Step 1: only create addressKey if we have address or store_number
          const addressKey = address 
            ? normalizeAddress(address) 
            : cleanStoreNumber 
            ? `store:${cleanStoreNumber}`
            : null;
          
          // Get locationId from map, or null if no addressKey (goes to unmapped bucket)
          const locationId = addressKey ? (locationMap.get(addressKey) || null) : null;
          
          // Parse financial fields
          const subtotal = parseFloat(getColumnValue(row, "subtotal", "Subtotal", "Sale_Amount", "sale amount")) || 0;
          const subtotalSalesTax = parseFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal_Sales_Tax", "tax amount", "Tax Amount")) || 0;
          const saleAmount = subtotal + subtotalSalesTax; // Calculate total sale amount

          transactions.push({
            clientId,
            locationId,
            orderId: orderNumber,
            orderDate: getColumnValue(row, "transaction_date", "Order_Date", "transaction date", "order_date"),
            transactionType: getColumnValue(row, "transaction_type", "Transaction_Type", "transaction type"),
            transactionId: transactionId,
            restaurant: locationName,
            orderChannel: getColumnValue(row, "order_channel", "Order_Channel", "order channel") || null,
            fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment_Type", "fulfillment type") || null,
            subtotal,
            subtotalSalesTax,
            saleAmount,
            commission: parseFloat(getColumnValue(row, "commission", "Commission")) || 0,
            deliveryCommission: parseFloat(getColumnValue(row, "delivery_commission", "Delivery_Commission", "delivery commission")) || 0,
            processingFee: parseFloat(getColumnValue(row, "processing_fee", "merchant_service_fee", "Processing_Fee", "processing fee")) || 0,
            merchantFundedPromotion: parseFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant_Funded_Promotion", "merchant funded promotion")) || 0,
            merchantNetTotal: parseFloat(getColumnValue(row, "merchant_net_total", "Merchant_Net_Total", "Net_Sales", "net sales")) || 0,
            transactionNote: getColumnValue(row, "transaction_note", "Transaction_Note", "transaction note") || null,
            customerType: getColumnValue(row, "gh_plus_customer", "Customer_Type", "customer type", "Customer Type") || "Unknown",
          });
        }
        
        // Step 3: Insert all transactions in batch
        await storage.createGrubhubTransactionsBatch(transactions);
        res.json({ success: true, rowsProcessed: transactions.length });
        return;
      }

      res.json({ success: true, rowsProcessed: rows.length });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper function to upsert campaign location metrics (prevent duplicates on re-upload)
  async function upsertCampaignLocationMetric(metric: InsertCampaignLocationMetric) {
    const existing = await storage.getCampaignLocationMetricByKey(
      metric.campaignId,
      metric.locationId ?? null,
      metric.dateStart ?? null
    );
    
    if (existing) {
      // Metric already exists for this campaign/location/date, skip it
      return existing;
    }
    
    return await storage.createCampaignLocationMetric(metric);
  }

  // Marketing data upload endpoint
  app.post("/api/upload/marketing", isAuthenticated, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { platform, clientId, dataType } = req.body;
      
      if (!platform || !clientId || !dataType) {
        return res.status(400).json({ error: "Platform, clientId, and dataType are required" });
      }

      const rows = parseCSV(req.file.buffer);
      let processedCount = 0;
      const campaignsProcessed = new Map<string, { name: string; type: string; startDate: string; endDate: string | null; totals: { orders: number; revenue: number; spend: number; discount: number; newCustomers: number } }>();

      if (platform === "doordash" && dataType === "promotions") {
        // DoorDash Promotions CSV
        for (const row of rows) {
          const campaignId = row["Campaign Id"];
          const campaignName = row["Campaign Name"] || `Campaign ${campaignId}`;
          const startDate = row["Campaign Start Date"];
          const endDate = row["Campaign End Date"] === "None" ? null : row["Campaign End Date"];
          
          const storeId = row["Merchant Store ID"] || row.merchant_store_id || row.Merchant_Store_ID || null;
          const locationName = row["Store Name"] || row["Store name"] || "";
          const locationId = await findOrCreateLocation(clientId, locationName, "doordash", storeId);
          
          const revenue = parseFloat(row["Sales"]) || 0;
          const spend = parseFloat(row["Marketing Fees | (Including any applicable taxes)"]) || 0;
          const discount = parseFloat(row["Customer Discounts from Marketing | (Funded by you)"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const roas = parseFloat(row["ROAS"]) || 0;
          const newCustomers = parseInt(row["New Cx Acquired"]) || 0;
          
          // Aggregate campaign-level totals
          if (!campaignsProcessed.has(campaignId)) {
            campaignsProcessed.set(campaignId, {
              name: campaignName,
              type: "promotion",
              startDate,
              endDate,
              totals: { orders: 0, revenue: 0, spend: 0, discount: 0, newCustomers: 0 }
            });
          }
          const campaign = campaignsProcessed.get(campaignId)!;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          campaign.totals.discount += discount;
          campaign.totals.newCustomers += newCustomers;
          
          // Store location-level metrics (upsert to prevent duplicates)
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "promotion",
            clientId,
            locationId,
            locationName: row["Store Name"],
            platform: "doordash",
            dateStart: startDate,
            dateEnd: endDate,
            orders,
            revenue,
            spend,
            discount,
            roas,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create promotion records
        for (const [campaignId, data] of campaignsProcessed) {
          const existing = await storage.getPromotionByCampaignId(campaignId);
          if (!existing) {
            await storage.createPromotion({
              campaignId,
              name: data.name,
              clientId,
              platforms: ["doordash"],
              type: data.type,
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              discountPercent: null,
              discountAmount: data.totals.discount > 0 ? data.totals.discount : null,
            });
          }
        }
      } else if (platform === "doordash" && dataType === "ads") {
        // DoorDash Ads CSV - Paid Ad Campaigns
        const adCampaignsData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { impressions: number; clicks: number; orders: number; revenue: number; spend: number; cpa: number } }>();
        
        for (const row of rows) {
          const campaignId = row["Campaign Id"];
          const campaignName = row["Campaign Name"] || `Ad Campaign ${campaignId}`;
          const startDate = row["Campaign Start Date"];
          const endDate = row["Campaign End Date"] === "None" ? null : row["Campaign End Date"];
          
          const locationId = await findOrCreateLocation(clientId, row["Store Name"], "doordash");
          
          const clicks = parseInt(row["Clicks"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const revenue = parseFloat(row["Sales"]) || 0;
          const spend = parseFloat(row["Marketing Fees | (Including any applicable taxes)"]) || 0;
          const roas = parseFloat(row["ROAS"]) || 0;
          const cpa = parseFloat(row["Average CPA"]) || 0;
          const newCustomers = parseInt(row["New Cx Acquired"]) || 0;
          
          // Aggregate campaign-level totals
          if (!adCampaignsData.has(campaignId)) {
            adCampaignsData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { impressions: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, cpa: 0 }
            });
          }
          const campaign = adCampaignsData.get(campaignId)!;
          campaign.totals.clicks += clicks;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          if (cpa > 0) campaign.totals.cpa = cpa; // Use last seen CPA value
          
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "paid_ad",
            clientId,
            locationId,
            locationName: row["Store Name"],
            platform: "doordash",
            dateStart: startDate,
            dateEnd: endDate,
            clicks,
            orders,
            revenue,
            spend,
            roas,
            cpa,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create paid ad campaign records
        for (const [campaignId, data] of adCampaignsData) {
          const existing = await storage.getPaidAdCampaignByCampaignId(campaignId);
          if (!existing) {
            await storage.createPaidAdCampaign({
              campaignId,
              name: data.name,
              clientId,
              platform: "doordash",
              type: "paid_ad",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              budget: null,
              impressions: data.totals.impressions,
              clicks: data.totals.clicks,
              ctr: data.totals.clicks / (data.totals.impressions || 1),
              cpc: data.totals.spend / (data.totals.clicks || 1),
              orders: data.totals.orders,
              conversionRate: (data.totals.orders / (data.totals.clicks || 1)) * 100,
              spend: data.totals.spend,
              revenue: data.totals.revenue,
              roas: data.totals.revenue / (data.totals.spend || 1),
              cpa: data.totals.cpa,
            });
          }
        }
      } else if (platform === "uber" && dataType === "campaigns") {
        // Uber Campaign Location CSV - Paid Ad Campaigns
        const uberCampaignsData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { impressions: number; clicks: number; orders: number; revenue: number; spend: number; ctr: number; cpc: number; cpa: number; conversionRate: number } }>();
        
        for (const row of rows) {
          // Use Campaign UUID as the primary identifier (not Location UUID)
          const campaignId = row["Campaign UUID"];
          if (!campaignId) {
            continue;
          }
          
          const campaignName = row["Campaign name"] || `Uber Campaign ${campaignId.substring(0, 8)}`;
          const locationName = row["Location name"];
          const startDate = row["Start date"];
          const endDate = row["End date"];
          
          const locationId = await findOrCreateLocation(clientId, locationName, "ubereats");
          
          const impressions = parseInt(row["Impressions"]) || 0;
          const clicks = parseInt(row["Clicks"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const revenue = parseFloat(row["Sales"]?.replace(/,/g, "")) || 0;
          const spend = parseFloat(row["Ad spend"]) || 0;
          const roas = parseFloat(row["Return on Ad Spend"]) || 0;
          const ctr = parseFloat(row["Click through rate"]) || 0;
          const conversionRate = parseFloat(row["Conversion rate"]) || 0;
          const cpc = parseFloat(row["Cost per click"]) || 0;
          const cpa = parseFloat(row["Cost per order"]) || 0;
          
          // Aggregate campaign-level totals
          if (!uberCampaignsData.has(campaignId)) {
            uberCampaignsData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { impressions: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, ctr: 0, cpc: 0, cpa: 0, conversionRate: 0 }
            });
          }
          const campaign = uberCampaignsData.get(campaignId)!;
          campaign.totals.impressions += impressions;
          campaign.totals.clicks += clicks;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "paid_ad",
            clientId,
            locationId,
            locationName,
            platform: "ubereats",
            dateStart: startDate,
            dateEnd: endDate,
            impressions,
            clicks,
            orders,
            revenue,
            spend,
            roas,
            ctr,
            conversionRate,
            cpc,
            cpa,
          });
          
          processedCount++;
        }
        
        // Create paid ad campaign records
        for (const [campaignId, data] of uberCampaignsData) {
          const existing = await storage.getPaidAdCampaignByCampaignId(campaignId);
          if (!existing) {
            await storage.createPaidAdCampaign({
              campaignId,
              name: data.name,
              clientId,
              platform: "ubereats",
              type: "paid_ad",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              budget: null,
              impressions: data.totals.impressions,
              clicks: data.totals.clicks,
              ctr: data.totals.clicks / (data.totals.impressions || 1),
              cpc: data.totals.spend / (data.totals.clicks || 1),
              orders: data.totals.orders,
              conversionRate: (data.totals.orders / (data.totals.clicks || 1)) * 100,
              spend: data.totals.spend,
              revenue: data.totals.revenue,
              roas: data.totals.revenue / (data.totals.spend || 1),
              cpa: data.totals.spend / (data.totals.orders || 1),
            });
          }
        }
      } else if (platform === "uber" && dataType === "offers") {
        // Uber Offers/Campaigns CSV - Promotions
        const uberOffersData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { orders: number; revenue: number; newCustomers: number } }>();
        
        for (const row of rows) {
          const campaignId = row["Campaign UUID"];
          const campaignName = row["Campaign name"] || `Uber Offer ${campaignId.substring(0, 8)}`;
          const startDate = row["Start date"];
          const endDate = row["End date"];
          
          const revenue = parseFloat(row["Sales (USD)"]?.replace(/[$,]/g, "")) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const newCustomers = parseInt(row["New customers"]) || 0;
          
          // Aggregate campaign-level totals
          if (!uberOffersData.has(campaignId)) {
            uberOffersData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { orders: 0, revenue: 0, newCustomers: 0 }
            });
          }
          const campaign = uberOffersData.get(campaignId)!;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.newCustomers += newCustomers;
          
          // Note: This CSV doesn't have location-level data, so we'll create a single aggregate record
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "promotion",
            clientId,
            locationId: null,
            locationName: "All Stores",
            platform: "ubereats",
            dateStart: startDate,
            dateEnd: endDate,
            orders,
            revenue,
            spend: 0,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create promotion records
        for (const [campaignId, data] of uberOffersData) {
          const existing = await storage.getPromotionByCampaignId(campaignId);
          if (!existing) {
            await storage.createPromotion({
              campaignId,
              name: data.name,
              clientId,
              platforms: ["ubereats"],
              type: "promotion",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              discountPercent: null,
              discountAmount: null,
            });
          }
        }
      } else {
        return res.status(400).json({ error: `Unsupported platform/dataType combination: ${platform}/${dataType}` });
      }

      res.json({
        success: true,
        rowsProcessed: processedCount,
      });
    } catch (error: any) {
      console.error("Marketing upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/locations", async (req, res) => {
    try {
      const { clientId } = req.query;
      const locations = clientId
        ? await storage.getLocationsByClient(clientId as string)
        : await storage.getAllLocations();
      res.json(locations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(validatedData);
      res.status(201).json(location);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid location data", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/locations/suggestions", async (req, res) => {
    try {
      const { clientId } = req.query;
      const suggestions = await storage.getLocationMatchSuggestions(clientId as string);
      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations/match", isAuthenticated, async (req, res) => {
    try {
      const { locationName, platform, matchedLocationId } = req.body;

      if (!locationName || !platform || !matchedLocationId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const updates: any = {};
      if (platform === "ubereats") updates.uberEatsName = locationName;
      if (platform === "doordash") updates.doordashName = locationName;
      if (platform === "grubhub") updates.grubhubName = locationName;

      const updated = await storage.updateLocation(matchedLocationId, updates);
      
      if (!updated) {
        return res.status(404).json({ error: "Location not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/locations/duplicates", isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      const duplicates = await storage.getDuplicateLocations(clientId as string | undefined);
      res.json(duplicates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations/merge", isAuthenticated, async (req, res) => {
    try {
      const { targetLocationId, sourceLocationIds } = req.body;

      if (!targetLocationId || !sourceLocationIds || !Array.isArray(sourceLocationIds)) {
        return res.status(400).json({ error: "Missing or invalid required fields" });
      }

      const mergedLocation = await storage.mergeLocations(targetLocationId, sourceLocationIds);
      res.json(mergedLocation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/locations/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteLocation(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Location not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete transactions by date range (for data cleanup/reimport)
  app.delete("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const { clientId, startDate, endDate } = req.query;

      if (!clientId || !startDate || !endDate) {
        return res.status(400).json({ error: "Missing required fields: clientId, startDate, endDate" });
      }

      const uberDeleted = await storage.deleteUberEatsTransactionsByDateRange(
        clientId as string,
        startDate as string,
        endDate as string
      );

      const doorDeleted = await storage.deleteDoordashTransactionsByDateRange(
        clientId as string,
        startDate as string,
        endDate as string
      );

      const grubDeleted = await storage.deleteGrubhubTransactionsByDateRange(
        clientId as string,
        startDate as string,
        endDate as string
      );

      const financialsDeleted = await storage.deleteLocationWeeklyFinancialsByClient(clientId as string);

      const totalDeleted = uberDeleted + doorDeleted + grubDeleted;

      res.json({
        success: true,
        deleted: {
          uberEats: uberDeleted,
          doorDash: doorDeleted,
          grubhub: grubDeleted,
          financials: financialsDeleted,
          total: totalDeleted
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Preview Google Sheets data structure (for debugging)
  app.post("/api/locations/preview-sheet", isAuthenticated, async (req, res) => {
    try {
      const { spreadsheetUrl } = req.body;

      if (!spreadsheetUrl) {
        return res.status(400).json({ error: "Missing spreadsheetUrl" });
      }

      // Extract spreadsheet ID from URL
      const spreadsheetIdMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!spreadsheetIdMatch) {
        return res.status(400).json({ error: "Invalid Google Sheets URL" });
      }
      const spreadsheetId = spreadsheetIdMatch[1];

      // Import fetchSheetData function
      const { fetchSheetData } = await import("./google-sheets");

      // Fetch first 10 rows to preview structure
      const sheetData = await fetchSheetData(spreadsheetId, "Sheet1!A1:F10");

      // Focus on Column C (index 2)
      const columnCData = sheetData.map((row, idx) => ({
        row: idx,
        columnC: row[2] || null,
        columnA: row[0] || null,
        columnB: row[1] || null,
      }));

      res.json({
        preview: sheetData,
        headers: sheetData[0],
        firstRow: sheetData[1],
        columnCAnalysis: columnCData,
      });
    } catch (error: any) {
      console.error("Sheet preview error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Diagnostic endpoint to show CSV structure from each platform
  app.get("/api/diagnostics/csv-structure", isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;

      if (!clientId) {
        return res.status(400).json({ error: "Missing clientId" });
      }

      // Get sample transactions from each platform
      const uberSample = await storage.getUberEatsTransactionSample(clientId as string, 3);
      const doorSample = await storage.getDoordashTransactionSample(clientId as string, 3);
      const grubSample = await storage.getGrubhubTransactionSample(clientId as string, 3);

      // Get sample locations with Store IDs
      const locations = await storage.getLocationsByClient(clientId as string);
      const locationsWithStoreId = locations.filter(l => l.storeId).slice(0, 5);

      res.json({
        masterLocations: locationsWithStoreId.map(l => ({
          storeId: l.storeId,
          canonicalName: l.canonicalName,
          uberEatsName: l.uberEatsName,
          doordashName: l.doordashName,
          grubhubName: l.grubhubName,
        })),
        sampleTransactions: {
          uberEats: uberSample,
          doordash: doorSample,
          grubhub: grubSample,
        },
      });
    } catch (error: any) {
      console.error("CSV structure diagnostic error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Import master location list from Google Sheets
  app.post("/api/locations/import-master-list", isAuthenticated, async (req, res) => {
    try {
      const { spreadsheetUrl, clientId } = req.body;

      if (!spreadsheetUrl || !clientId) {
        return res.status(400).json({ error: "Missing spreadsheetUrl or clientId" });
      }

      // Extract spreadsheet ID from URL
      const spreadsheetIdMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!spreadsheetIdMatch) {
        return res.status(400).json({ error: "Invalid Google Sheets URL" });
      }
      const spreadsheetId = spreadsheetIdMatch[1];

      // Import fetchSheetData function
      const { fetchSheetData } = await import("./google-sheets");

      // Fetch the data from the sheet
      // Try to get the gid from the URL to identify the specific sheet
      const gidMatch = spreadsheetUrl.match(/gid=(\d+)/);
      const range = "A:Z"; // Get all columns
      
      // If no specific sheet is specified, use the first sheet
      const sheetData = await fetchSheetData(spreadsheetId, range);

      if (!sheetData || sheetData.length === 0) {
        return res.status(400).json({ error: "No data found in spreadsheet" });
      }

      // First row should be headers
      const headers = sheetData[0];
      const rows = sheetData.slice(1);

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        // Skip empty rows
        if (!row || row.length === 0 || !row[2]) {
          skipped++;
          continue;
        }

        // Column C (index 2) is the Master Store Code (canonical ID)
        const storeId = row[2]?.toString().trim();
        if (!storeId) {
          skipped++;
          continue;
        }

        // Column C (Shop IDs Owned) is the canonical name
        const canonicalName = storeId;
        
        // Column E (index 4) - Platform-specific matching key for DD & UE
        const platformMatchKey = row[4]?.toString().trim() || null;
        
        // Column G (index 6) is the address - used for Grubhub matching
        const address = row[6]?.toString().trim() || null;

        // Check if location with this Store ID already exists
        const allLocations = await storage.getLocationsByClient(clientId);
        const existingLocation = allLocations.find(loc => loc.storeId === storeId);

        if (existingLocation) {
          // Always update canonical name, address, and platform keys from master sheet
          const updates: any = {};
          
          // Always update canonical name to match Column C (Shop IDs Owned)
          if (canonicalName !== existingLocation.canonicalName) {
            updates.canonicalName = canonicalName;
          }
          
          // Always update address if provided
          if (address && address !== existingLocation.address) {
            updates.address = address;
          }
          
          // Always update platform matching keys if provided
          if (platformMatchKey) {
            if (platformMatchKey !== existingLocation.doorDashStoreKey) {
              updates.doorDashStoreKey = platformMatchKey;
            }
            if (platformMatchKey !== existingLocation.uberEatsStoreLabel) {
              updates.uberEatsStoreLabel = platformMatchKey;
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateLocation(existingLocation.id, updates);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Create new location with Store ID from Column C
          await storage.createLocation({
            clientId,
            storeId, // Column C: Shop IDs Owned
            canonicalName,
            address, // Column G: Address
            doorDashStoreKey: platformMatchKey, // Column E: for DoorDash matching
            uberEatsStoreLabel: platformMatchKey, // Column E: for Uber Eats matching
            uberEatsName: null,
            doordashName: null,
            grubhubName: null,
            isVerified: true,
            locationTag: null,
          });
          created++;
        }
      }

      res.json({
        success: true,
        created,
        updated,
        skipped,
        total: rows.length,
      });
    } catch (error: any) {
      console.error("Master list import error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/weeks", async (req, res) => {
    try {
      const weeks = await storage.getAvailableWeeks();
      res.json(weeks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Comprehensive diagnostic report endpoint
  app.get("/api/analytics/diagnostic", isAuthenticated, async (req, res) => {
    try {
      const { weekStart, weekEnd, clientId } = req.query;
      
      // Get all data for the specified week (or all data if no week specified)
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
      };

      const overview = await storage.getDashboardOverview(filters);
      const locations = await storage.getLocationMetrics(filters);
      const allLocations = await storage.getAllLocations();
      
      // Get promotions and paid ads
      const promotions = await storage.getPromotionMetrics(filters);
      const paidAds = await storage.getPaidAdCampaignMetrics(filters);
      
      // Calculate transaction counts using SQL (efficient, no memory loading)
      let platformBreakdown: Array<{ platform: string; transactionCount: number }> = [];
      
      if (clientId) {
        const counts = await storage.getTransactionCounts(clientId as string);
        platformBreakdown = counts.map(c => ({
          platform: c.platform,
          transactionCount: c.count,
        }));
      }
      const duplicateLocations = await storage.getDuplicateLocations(clientId as string | undefined);
      
      // Calculate marketing metrics from promotions and ads
      const totalMarketingInvestment = 
        promotions.reduce((sum, p) => sum + (p.totalCost || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalSpend || 0), 0);
      
      const marketingDrivenSales = 
        promotions.reduce((sum, p) => sum + (p.totalRevenue || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalRevenue || 0), 0);
      
      const marketingOrders = 
        promotions.reduce((sum, p) => sum + (p.totalOrders || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalOrders || 0), 0);
      
      const report = {
        dateRange: weekStart && weekEnd 
          ? { weekStart, weekEnd }
          : { all: true },
        timestamp: new Date().toISOString(),
        clientId: clientId || "all",
        
        overallMetrics: {
          totalSales: overview.totalSales,
          totalOrders: overview.totalOrders,
          avgOrderValue: overview.avgOrderValue,
          totalNetPayout: overview.totalNetPayout,
          netPayoutPercentage: overview.netPayoutPercentage,
        },
        
        platformBreakdown,
        
        marketingPerformance: {
          totalMarketingInvestment,
          marketingDrivenSales,
          marketingOrders,
          overallROAS: totalMarketingInvestment > 0 ? marketingDrivenSales / totalMarketingInvestment : 0,
          trueCPO: marketingOrders > 0 ? totalMarketingInvestment / marketingOrders : 0,
          promotionsCount: promotions.length,
          paidAdsCount: paidAds.length,
        },
        
        dataQuality: {
          totalLocations: allLocations.length,
          locationsWithTransactions: locations.length,
          duplicateLocationGroups: duplicateLocations.length,
          totalDuplicateLocations: duplicateLocations.reduce((sum, d) => sum + d.count, 0),
        },
        
        topPerformingLocations: locations
          .sort((a, b) => b.totalSales - a.totalSales)
          .slice(0, 10)
          .map(loc => ({
            locationName: loc.locationName,
            sales: loc.totalSales,
            orders: loc.totalOrders,
          })),
      };
      
      res.json(report);
    } catch (error: any) {
      console.error("Diagnostic report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      
      // Get current week overview
      const overview = await storage.getDashboardOverview(filters);
      
      // Calculate previous week data if weekStart is provided
      if (weekStart) {
        const currentWeekStart = new Date(weekStart + 'T00:00:00Z');
        const previousWeekStart = new Date(currentWeekStart);
        previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
        
        const previousWeekEnd = new Date(previousWeekStart);
        previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() + 6);
        
        const formatDate = (date: Date): string => {
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        const previousFilters = {
          ...filters,
          weekStart: formatDate(previousWeekStart),
          weekEnd: formatDate(previousWeekEnd),
        };
        
        const previousOverview = await storage.getDashboardOverview(previousFilters);
        
        // Debug logging (development only) - removed to prevent sensitive data exposure
        if (process.env.NODE_ENV === 'development') {
          console.log('[DEBUG - Overview Comparison]', {
            current: {
              week: `${weekStart} to ${weekEnd}`,
              totalOrders: overview.totalOrders,
              platformCount: overview.platformBreakdown?.length || 0
            },
            previous: {
              week: `${previousFilters.weekStart} to ${previousFilters.weekEnd}`,
              totalOrders: previousOverview.totalOrders,
              platformCount: previousOverview.platformBreakdown?.length || 0
            }
          });
        }
        
        // Calculate net payout for current week
        const currentNetPayout = overview.totalSales * (overview.netPayoutPercent / 100);
        const previousNetPayout = previousOverview.totalSales * (previousOverview.netPayoutPercent / 100);
        
        // Calculate marketing orders for True CPO
        const currentMarketingOrders = overview.platformBreakdown.reduce((sum, p) => sum + p.ordersFromMarketing, 0);
        const previousMarketingOrders = previousOverview.platformBreakdown.reduce((sum, p) => sum + p.ordersFromMarketing, 0);
        
        // Calculate True CPO (Cost Per Order for marketing-driven orders)
        const currentTrueCpo = currentMarketingOrders > 0 ? overview.totalMarketingInvestment / currentMarketingOrders : 0;
        const previousTrueCpo = previousMarketingOrders > 0 ? previousOverview.totalMarketingInvestment / previousMarketingOrders : 0;
        
        // Add comparison data with percentage changes (null if previous is 0 or missing)
        overview.comparison = {
          totalSales: calculatePercentageChange(overview.totalSales, previousOverview.totalSales),
          totalOrders: calculatePercentageChange(overview.totalOrders, previousOverview.totalOrders),
          averageAov: calculatePercentageChange(overview.averageAov, previousOverview.averageAov),
          totalMarketingInvestment: calculatePercentageChange(overview.totalMarketingInvestment, previousOverview.totalMarketingInvestment),
          blendedRoas: calculatePercentageChange(overview.blendedRoas, previousOverview.blendedRoas),
          netPayout: calculatePercentageChange(currentNetPayout, previousNetPayout),
          trueCpo: calculatePercentageChange(currentTrueCpo, previousTrueCpo),
        };
      }
      
      res.json(overview);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/client-performance", async (req, res) => {
    try {
      const performance = await storage.getClientPerformance();
      res.json(performance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/locations", async (req, res) => {
    try {
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      const metrics = await storage.getLocationMetrics(filters);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/locations/consolidated", async (req, res) => {
    try {
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      const metrics = await storage.getConsolidatedLocationMetrics(filters);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/weekly-trend", async (req, res) => {
    try {
      const { clientId, locationId, platform, locationTag } = req.query;
      
      // Get all available weeks
      const weeks = await storage.getAvailableWeeks();
      
      // Get overview for each week
      const weeklyData = await Promise.all(
        weeks.map(async (week) => {
          const filters: AnalyticsFilters = {
            clientId: clientId as string | undefined,
            locationId: locationId as string | undefined,
            platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
            weekStart: week.weekStart,
            weekEnd: week.weekEnd,
            locationTag: locationTag as string | undefined,
          };
          const overview = await storage.getDashboardOverview(filters);
          return {
            weekStart: week.weekStart,
            weekEnd: week.weekEnd,
            weekLabel: `${week.weekStart.slice(5)} - ${week.weekEnd.slice(5)}`,
            totalSales: overview.totalSales,
            totalOrders: overview.totalOrders,
            averageAov: overview.averageAov,
            totalMarketingInvestment: overview.totalMarketingInvestment,
            blendedRoas: overview.blendedRoas,
            netPayoutPercent: overview.netPayoutPercent,
          };
        })
      );
      
      res.json(weeklyData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Temporary diagnostic endpoint to check master sheet
  app.get("/api/diagnostic/master-locations", async (req, res) => {
    try {
      const { fetchMasterLocations } = await import('./google-sheets.js');
      const masterLocations = await fetchMasterLocations();
      
      res.json({
        totalMasterLocations: masterLocations.length,
        sampleLocations: masterLocations.slice(0, 10).map(loc => ({
          storeId: loc.storeId,
          shopName: loc.shopName,
          state: loc.state
        }))
      });
    } catch (error: any) {
      console.error("Master locations fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sync master locations from Google Sheets
  app.post("/api/diagnostic/sync-master-locations", async (req, res) => {
    try {
      const { fetchMasterLocations } = await import('./google-sheets.js');
      const masterLocations = await fetchMasterLocations();
      
      const clientId = '83506705-b408-4f0a-a9b0-e5b585db3b7d';
      let createdCount = 0;
      let updatedCount = 0;
      
      // Get all existing locations
      const dbLocations = await storage.getLocationsByClient(clientId);
      
      // Process each master location
      for (const masterLoc of masterLocations) {
        if (!masterLoc.storeId || !masterLoc.shopName) continue;
        
        // Find existing location by store_id
        const existing = dbLocations.find(l => l.storeId === masterLoc.storeId);
        
        if (existing) {
          // Update existing location to master format
          await storage.updateLocation(existing.id, {
            canonicalName: `Caps - ${masterLoc.shopName}`,
            isVerified: true,
            locationTag: 'master'
          });
          updatedCount++;
        } else {
          // Create new master location
          await storage.createLocation({
            clientId,
            storeId: masterLoc.storeId,
            canonicalName: `Caps - ${masterLoc.shopName}`,
            address: masterLoc.address,
            doorDashStoreKey: masterLoc.doorDashStoreKey,
            uberEatsStoreLabel: masterLoc.uberEatsStoreLabel,
            isVerified: true,
            locationTag: 'master'
          });
          createdCount++;
        }
      }
      
      res.json({
        success: true,
        createdCount,
        updatedCount,
        totalMasterLocations: masterLocations.length
      });
    } catch (error: any) {
      console.error("Sync master locations error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/data-quality", async (req, res) => {
    try {
      const { clientId } = req.query;
      
      // Guard: Return empty metrics if no clientId provided
      if (!clientId) {
        return res.json({
          unmappedTransactions: {
            ubereats: 0,
            doordash: 0,
            grubhub: 0,
          }
        });
      }
      
      // Get unmapped location bucket
      const allLocations = await storage.getLocationsByClient(clientId as string);
      const unmappedBucket = allLocations.find(l => 
        l.canonicalName === "Unmapped Locations" && l.locationTag === "unmapped_bucket"
      );
      
      if (!unmappedBucket) {
        return res.json({
          unmappedTransactions: {
            ubereats: 0,
            doordash: 0,
            grubhub: 0,
          }
        });
      }
      
      // Get transaction counts for unmapped bucket
      const unmappedCounts = await storage.getTransactionCounts(clientId as string, unmappedBucket.id);
      
      // Find counts for each platform
      const ubereatsCount = unmappedCounts.find(c => c.platform === 'ubereats')?.count || 0;
      const doordashCount = unmappedCounts.find(c => c.platform === 'doordash')?.count || 0;
      const grubhubCount = unmappedCounts.find(c => c.platform === 'grubhub')?.count || 0;
      
      res.json({
        unmappedTransactions: {
          ubereats: ubereatsCount,
          doordash: doordashCount,
          grubhub: grubhubCount,
        }
      });
    } catch (error: any) {
      console.error("Data quality metrics error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/promotions", isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      const promotions = await storage.getAllPromotions(clientId as string);
      res.json(promotions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/promotions", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPromotionSchema.parse(req.body);
      const promotion = await storage.createPromotion(validatedData);
      res.json(promotion);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/promotions/:id", isAuthenticated, async (req, res) => {
    try {
      const promotion = await storage.getPromotion(req.params.id);
      if (!promotion) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json(promotion);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/promotions/:id", async (req, res) => {
    try {
      const validatedData = insertPromotionSchema.partial().parse(req.body);
      const updated = await storage.updatePromotion(req.params.id, validatedData);
      if (!updated) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/promotions/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deletePromotion(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/promotions", async (req, res) => {
    try {
      const { clientId } = req.query;
      const metrics = await storage.getPromotionMetrics(clientId as string);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paid-ads", isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      const campaigns = await storage.getAllPaidAdCampaigns(clientId as string);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paid-ads", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPaidAdCampaignSchema.parse(req.body);
      const campaign = await storage.createPaidAdCampaign(validatedData);
      res.json(campaign);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paid-ads/:id", isAuthenticated, async (req, res) => {
    try {
      const campaign = await storage.getPaidAdCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/paid-ads/:id", async (req, res) => {
    try {
      const validatedData = insertPaidAdCampaignSchema.partial().parse(req.body);
      const updated = await storage.updatePaidAdCampaign(req.params.id, validatedData);
      if (!updated) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/paid-ads/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deletePaidAdCampaign(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/paid-ads", isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      const metrics = await storage.getPaidAdCampaignMetrics(clientId as string);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/location-weekly-financials", isAuthenticated, async (req, res) => {
    try {
      const { clientId, locationId } = req.query;
      
      if (locationId) {
        const financials = await storage.getLocationWeeklyFinancials(locationId as string);
        res.json(financials);
      } else if (clientId) {
        const financials = await storage.getLocationWeeklyFinancialsByClient(clientId as string);
        res.json(financials);
      } else {
        res.status(400).json({ error: "Either clientId or locationId is required" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/location-weekly-financials", isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertLocationWeeklyFinancialSchema.parse(req.body);
      const financial = await storage.createLocationWeeklyFinancial(validatedData);
      res.json(financial);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Test locations weekly financials report - calculated from transaction data
  app.get("/api/analytics/test-locations-report", async (req, res) => {
    try {
      const { clientId } = req.query;
      
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      // Get all database locations for this client
      const allDbLocations = await storage.getLocationsByClient(clientId as string);
      
      // Explicit list of 16 corporate test location Store IDs (Nevada + Arizona)
      const corpStoreIds = [
        'AZ900482', 'NV008', 'NV036', 'NV051', 'NV054', 'NV067', 'NV079',
        'NV103', 'NV111', 'NV121', 'NV126', 'NV151', 'NV152', 'NV191',
        'NV900467', 'NV900478'
      ];
      
      // Canonical name patterns to match (handles duplicates without store_id) - must be very specific!
      const corpLocationPatterns = [
        { pattern: /Broadway.*Tucson|Tucson.*Broadway/i, shopId: 'AZ900482', shopName: 'AZ900482 Tucson Broadway' },
        { pattern: /Sahara.*Las Vegas(?!.*West)/i, shopId: 'NV008', shopName: 'NV008 Las Vegas Sahara' },
        { pattern: /Silverado/i, shopId: 'NV036', shopName: 'NV036 Las Vegas Silverado' },
        { pattern: /Horizon(?!.*Ridge)/i, shopId: 'NV051', shopName: 'NV051 Henderson Horizon' },
        { pattern: /Stanford/i, shopId: 'NV054', shopName: 'NV054 Sparks Stanford' },
        { pattern: /Meadows.*Reno|Reno.*Meadows/i, shopId: 'NV067', shopName: 'NV067 Reno Meadows' },
        { pattern: /Sierra St/i, shopId: 'NV079', shopName: 'NV079 Reno Sierra St' },
        { pattern: /Boulder.*Hwy(?!.*City)|North Boulder/i, shopId: 'NV103', shopName: 'NV103 Henderson Boulder Hwy' },
        { pattern: /Craig.*Mitchell|Mitchell.*Craig|East Craig(?!.*031)/i, shopId: 'NV111', shopName: 'NV111 NLV Craig and Mitchell' },
        { pattern: /Downtown.*Summerlin|Summerlin.*Downtown/i, shopId: 'NV121', shopName: 'NV121 LV Downtown Summerlin' },
        { pattern: /Aliante.*Pkwy|Aliante.*Nature Park(?!.*Casino)/i, shopId: 'NV126', shopName: 'NV126 NLV Aliante Pkwy and Nature Park' },
        { pattern: /Maryland.*Pkwy/i, shopId: 'NV151', shopName: 'NV151 LV Maryland Pkwy' },
        { pattern: /Plumb/i, shopId: 'NV152', shopName: 'NV152 Reno Plumb Virginia' },
        { pattern: /Carson.*William|William.*Carson/i, shopId: 'NV191', shopName: 'NV191 Carson City William' },
        { pattern: /Los Altos/i, shopId: 'NV900467', shopName: 'NV900467 Sparks Los Altos' },
        { pattern: /S Las Vegas|South Las Vegas(?!.*Blvd)/i, shopId: 'NV900478', shopName: 'NV900478 LV S Las Vegas' },
      ];
      
      // Filter to only the 16 corporate locations (by store_id OR canonical name pattern)
      const corpLocations = allDbLocations.filter(loc => {
        // If location has a store_id, ONLY check if it's in the corp list
        if (loc.storeId) {
          const storeCode = loc.storeId.split(' ')[0];
          return corpStoreIds.includes(storeCode);
        }
        
        // For locations WITHOUT store_id (duplicates), match by canonical name pattern
        if (loc.canonicalName) {
          return corpLocationPatterns.some(p => p.pattern.test(loc.canonicalName || ''));
        }
        
        return false;
      });

      if (corpLocations.length === 0) {
        return res.json({ weeks: [], locations: [] });
      }

      // Create mappings for corp locations
      const corpLocationDbIds = new Set(corpLocations.map(l => l.id));
      
      // Map location IDs to canonical Shop IDs (handles duplicates)
      const dbLocationIdToShopId = new Map<string, string>();
      const dbLocationIdToShopName = new Map<string, string>();
      
      corpLocations.forEach(loc => {
        // Determine canonical Shop ID from store_id or canonical name pattern
        let shopId: string;
        let shopName: string;
        
        if (loc.storeId) {
          shopId = loc.storeId.split(' ')[0];
          shopName = loc.canonicalName || loc.storeId;
        } else {
          // Map duplicate locations to their canonical Store ID by pattern
          const name = loc.canonicalName || '';
          const match = corpLocationPatterns.find(p => p.pattern.test(name));
          if (match) {
            shopId = match.shopId;
            shopName = match.shopName;
          } else {
            // Fallback to location ID if no pattern matches
            shopId = loc.id;
            shopName = name;
          }
        }
        
        dbLocationIdToShopId.set(loc.id, shopId);
        dbLocationIdToShopName.set(loc.id, shopName);
      });
      
      // Fetch ONLY corp location transactions (optimized to avoid memory issues)
      const locationIdsArray = Array.from(corpLocationDbIds);
      const [corpUberTxns, corpDoorTxns, corpGrubTxns] = await Promise.all([
        storage.getUberEatsTransactionsByLocations(locationIdsArray),
        storage.getDoordashTransactionsByLocations(locationIdsArray),
        storage.getGrubhubTransactionsByLocations(locationIdsArray),
      ]);

      // Helper to get Monday of week for a date string
      const getMondayOfWeek = (dateStr: string): string => {
        const date = new Date(dateStr);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return monday.toISOString().split('T')[0];
      };

      // Helper to parse Uber Eats dates (M/D/YY format)
      const parseUberDate = (dateStr: string): string => {
        const [month, day, year] = dateStr.split('/');
        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      };

      // Aggregate metrics by canonical Shop ID and week
      interface WeeklyMetrics {
        sales: number;
        marketingSales: number;
        marketingSpend: number;
        payout: number;
        orders: number;
        marketingOrders: number;
      }

      const metricsByShopIdWeek = new Map<string, Map<string, WeeklyMetrics>>();

      // Process DoorDash transactions
      corpDoorTxns.forEach(t => {
        if (!t.locationId) return;
        
        const shopId = dbLocationIdToShopId.get(t.locationId);
        if (!shopId) return;
        
        const isMarketplace = !t.channel || t.channel === "Marketplace";
        const isCompleted = t.transactionType === "Order" || 
                          t.transactionType === "" ||
                          t.transactionType === null;
        
        if (!isMarketplace || !isCompleted) return;
        
        const weekStart = getMondayOfWeek(t.transactionDate);
        
        if (!metricsByShopIdWeek.has(shopId)) {
          metricsByShopIdWeek.set(shopId, new Map());
        }
        const shopWeeks = metricsByShopIdWeek.get(shopId)!;
        
        if (!shopWeeks.has(weekStart)) {
          shopWeeks.set(weekStart, {
            sales: 0,
            marketingSales: 0,
            marketingSpend: 0,
            payout: 0,
            orders: 0,
            marketingOrders: 0,
          });
        }
        
        const metrics = shopWeeks.get(weekStart)!;
        const sales = t.salesExclTax || t.orderSubtotal || 0;
        
        metrics.sales += sales;
        metrics.payout += t.totalPayout || t.netPayment || 0;
        metrics.orders += 1;
        
        // Marketing Investment: Ad Spend + Offer/Discount Value
        // Ad Spend: Sum of other_payments (from "Marketing fees" column)
        const adSpend = (t.otherPayments || 0) > 0 ? t.otherPayments : 0;
        
        // Offer/Discount Value: Sum abs of promotional discounts + credits
        // offers_on_items and delivery_offer_redemptions are NEGATIVE, credits are POSITIVE
        const offersValue = Math.abs(t.offersOnItems || 0) + 
                          Math.abs(t.deliveryOfferRedemptions || 0) +
                          (t.marketingCredits || 0) +
                          (t.thirdPartyContribution || 0);
        
        metrics.marketingSpend += adSpend + offersValue;
        
        // Marketing Attribution: Order has ANY marketing activity (ad spend OR offers/discounts)
        const hasMarketing = (Math.abs(t.otherPayments || 0) > 0) || 
                             (Math.abs(t.offersOnItems || 0) > 0) || 
                             (Math.abs(t.deliveryOfferRedemptions || 0) > 0);
        
        if (hasMarketing) {
          metrics.marketingSales += sales;
          metrics.marketingOrders += 1;
        }
      });

      // Process Uber Eats transactions
      let uberProcessed = 0;
      let uberSkipped = { noLocation: 0, noShopId: 0, notCompleted: 0, noDate: 0 };
      
      corpUberTxns.forEach(t => {
        if (!t.locationId) { uberSkipped.noLocation++; return; }
        
        const shopId = dbLocationIdToShopId.get(t.locationId);
        if (!shopId) { uberSkipped.noShopId++; return; }
        
        // Skip non-completed orders or invalid dates
        if (t.orderStatus !== 'Completed') { uberSkipped.notCompleted++; return; }
        if (!t.date || t.date === 'N/A') { uberSkipped.noDate++; return; }
        
        const weekStart = getMondayOfWeek(parseUberDate(t.date));
        uberProcessed++;
        
        if (!metricsByShopIdWeek.has(shopId)) {
          metricsByShopIdWeek.set(shopId, new Map());
        }
        const shopWeeks = metricsByShopIdWeek.get(shopId)!;
        
        if (!shopWeeks.has(weekStart)) {
          shopWeeks.set(weekStart, {
            sales: 0,
            marketingSales: 0,
            marketingSpend: 0,
            payout: 0,
            orders: 0,
            marketingOrders: 0,
          });
        }
        
        const metrics = shopWeeks.get(weekStart)!;
        // Use salesExclTax (primary, excl. tax), fallback to subtotal (incl. tax)
        const sales = t.salesExclTax || t.subtotal || 0;
        
        metrics.sales += sales;
        metrics.payout += t.netPayout || 0;
        metrics.orders += 1;
        
        // Marketing spend: offers + ad spend (from order-level charges)
        const offersValue = Math.abs(t.offersOnItems || 0) + 
                           Math.abs(t.deliveryOfferRedemptions || 0) +
                           Math.abs(t.offerRedemptionFee || 0);
        
        const adSpend = (t.otherPaymentsDescription && (t.otherPayments || 0) > 0 && 
                        isUberEatsAdRelatedDescription(t.otherPaymentsDescription)) 
                        ? t.otherPayments : 0;
        
        metrics.marketingSpend += offersValue + adSpend;
        
        // Marketing Attribution: Consistent with UberEats metrics calculation
        const isAdDriven = (t.otherPayments || 0) > 0 && 
                          isUberEatsAdRelatedDescription(t.otherPaymentsDescription);
        const hasPromotionalOffer = (t.offersOnItems < 0) || (t.deliveryOfferRedemptions < 0);
        const hasMarketing = isAdDriven || hasPromotionalOffer;
        
        if (hasMarketing) {
          metrics.marketingSales += sales;
          metrics.marketingOrders += 1;
        }
      });

      // Process Grubhub transactions
      corpGrubTxns.forEach(t => {
        if (!t.locationId) return;
        
        const shopId = dbLocationIdToShopId.get(t.locationId);
        if (!shopId) return;
        
        const isPrepaidOrder = !t.transactionType || t.transactionType === "Prepaid Order";
        if (!isPrepaidOrder) return;
        
        const weekStart = getMondayOfWeek(t.orderDate);
        
        if (!metricsByShopIdWeek.has(shopId)) {
          metricsByShopIdWeek.set(shopId, new Map());
        }
        const shopWeeks = metricsByShopIdWeek.get(shopId)!;
        
        if (!shopWeeks.has(weekStart)) {
          shopWeeks.set(weekStart, {
            sales: 0,
            marketingSales: 0,
            marketingSpend: 0,
            payout: 0,
            orders: 0,
            marketingOrders: 0,
          });
        }
        
        const metrics = shopWeeks.get(weekStart)!;
        const sales = t.saleAmount || 0;
        
        metrics.sales += sales;
        metrics.payout += t.merchantNetTotal || 0;
        metrics.orders += 1;
        
        const promoAmount = t.merchantFundedPromotion || 0;
        if (promoAmount !== 0) {
          metrics.marketingSpend += Math.abs(promoAmount);
          metrics.marketingSales += sales;
          metrics.marketingOrders += 1;
        }
      });

      // Get unique weeks
      const weekSet = new Set<string>();
      metricsByShopIdWeek.forEach(shopWeeks => {
        shopWeeks.forEach((_, week) => weekSet.add(week));
      });
      const weeks = Array.from(weekSet).sort();

      // Create Shop ID to Shop Name lookup from corp locations
      const shopIdToName = new Map<string, string>();
      for (const loc of corpLocations) {
        if (loc.storeId) {
          const shopId = loc.storeId.split(' ')[0];
          // Use canonical name for display (e.g., "Capriotti's Las Vegas NV 008")
          shopIdToName.set(shopId, loc.canonicalName || loc.storeId);
        }
      }

      // Format response
      const response = {
        weeks,
        locations: Array.from(metricsByShopIdWeek.entries())
          .map(([shopId, weeklyData]) => ({
            locationId: shopId,
            locationName: shopIdToName.get(shopId) || shopId,
            weeklyMetrics: weeks.map(week => {
              const data = weeklyData.get(week);
              if (!data) return null;
              
              const marketingPercent = data.marketingSales > 0 
                ? (data.marketingSpend / data.marketingSales) * 100 
                : 0;
              const roas = data.marketingSpend > 0 
                ? data.marketingSales / data.marketingSpend 
                : 0;
              const payoutPercent = data.sales > 0 
                ? (data.payout / data.sales) * 100 
                : 0;
              const payoutWithCogs = data.payout - (data.sales * 0.46);
              
              return {
                weekStartDate: week,
                sales: data.sales,
                marketingSales: data.marketingSales,
                marketingSpend: data.marketingSpend,
                marketingPercent,
                roas,
                payout: data.payout,
                payoutPercent,
                payoutWithCogs,
              };
            }),
          }))
          .sort((a, b) => a.locationName.localeCompare(b.locationName)),
      };

      res.json(response);
    } catch (error: any) {
      console.error("Test locations report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Income Statement - Financial breakdown by platform
  app.get("/api/analytics/income-statement", async (req, res) => {
    try {
      const { clientId, startDate, endDate } = req.query;
      
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      const start = startDate as string | undefined;
      const end = endDate as string | undefined;

      // Fetch all transactions for the client
      const [uberTxns, doorTxns, grubTxns] = await Promise.all([
        storage.getUberEatsTransactionsByClient(clientId as string),
        storage.getDoordashTransactionsByClient(clientId as string),
        storage.getGrubhubTransactionsByClient(clientId as string),
      ]);

      // Filter by date range if provided
      const filterByDate = (txns: any[], dateField: string) => {
        if (!start && !end) return txns;
        return txns.filter(t => {
          const txnDate = t[dateField];
          if (!txnDate) return false;
          if (start && txnDate < start) return false;
          if (end && txnDate > end) return false;
          return true;
        });
      };

      const filteredUber = filterByDate(uberTxns, 'date');
      const filteredDoor = filterByDate(doorTxns, 'transactionDate');
      const filteredGrub = filterByDate(grubTxns, 'orderDate');

      // Helper to calculate metrics for a platform
      interface PlatformMetrics {
        transactions: number;
        salesInclTax: number;
        salesExclTax: number;
        unfulfilledSales: number;
        unfulfilledRefunds: number;
        taxes: number;
        taxesWithheld: number;
        taxesBackup: number;
        commissions: number;
        restDeliveryCharge: number;
        loyalty: number;
        adSpend: number;
        promoSpend: number;
        ddMarketingFee: number;
        merchantFundedDiscount: number;
        thirdPartyFundedDiscount: number;
        customerRefunds: number;
        wonDisputes: number;
        customerTip: number;
        restaurantFees: number;
        miscellaneous: number;
        unaccounted: number;
        netPayout: number;
      }

      const initMetrics = (): PlatformMetrics => ({
        transactions: 0,
        salesInclTax: 0,
        salesExclTax: 0,
        unfulfilledSales: 0,
        unfulfilledRefunds: 0,
        taxes: 0,
        taxesWithheld: 0,
        taxesBackup: 0,
        commissions: 0,
        restDeliveryCharge: 0,
        loyalty: 0,
        adSpend: 0,
        promoSpend: 0,
        ddMarketingFee: 0,
        merchantFundedDiscount: 0,
        thirdPartyFundedDiscount: 0,
        customerRefunds: 0,
        wonDisputes: 0,
        customerTip: 0,
        restaurantFees: 0,
        miscellaneous: 0,
        unaccounted: 0,
        netPayout: 0,
      });

      // Calculate Uber Eats metrics
      const uberMetrics = filteredUber.reduce((acc, t) => {
        acc.transactions += 1;
        acc.salesInclTax += t.subtotal || 0;
        acc.salesExclTax += t.subtotal || 0; // Uber doesn't separate tax in payout report
        acc.taxes += 0; // Taxes included in subtotal
        acc.taxesWithheld += t.taxesWithheld || 0;
        acc.taxesBackup += t.taxesBackup || 0;
        acc.commissions += Math.abs(t.commission || 0);
        acc.adSpend += t.marketingAmount || 0;
        acc.promoSpend += Math.abs(t.marketingPromo || 0);
        acc.customerRefunds += Math.abs(t.adjustments || 0);
        acc.customerTip += t.driverTip || 0;
        acc.miscellaneous += t.misc || 0;
        acc.netPayout += t.netPayout || 0;
        return acc;
      }, initMetrics());

      // Calculate DoorDash metrics
      const doorMetrics = filteredDoor.reduce((acc, t) => {
        const isMarketplace = !t.channel || t.channel === "Marketplace";
        const isCompleted = !t.orderStatus || t.orderStatus === "Delivered" || t.orderStatus === "Picked Up";
        
        if (!isMarketplace) return acc;
        
        if (isCompleted) {
          acc.transactions += 1;
          const sales = t.salesExclTax || t.orderSubtotal || 0;
          const tax = t.tax || 0;
          acc.salesInclTax += sales + tax;
          acc.salesExclTax += sales;
          acc.taxes += tax;
          acc.commissions += Math.abs(t.commission || 0);
          acc.restDeliveryCharge += t.deliveryFee || 0;
          acc.adSpend += Math.abs(t.otherPayments || 0);
          acc.promoSpend += Math.abs(t.offersOnItems || 0) + 
                          Math.abs(t.deliveryOfferRedemptions || 0);
          acc.ddMarketingFee += Math.abs(t.marketingCredits || 0);
          acc.merchantFundedDiscount += Math.abs(t.offersOnItems || 0);
          acc.thirdPartyFundedDiscount += Math.abs(t.thirdPartyContribution || 0);
          acc.customerRefunds += Math.abs(t.refunds || 0);
          acc.customerTip += t.tip || 0;
          acc.restaurantFees += Math.abs(t.otherFees || 0);
        }
        
        // Net payout includes all statuses for reconciliation
        acc.netPayout += t.totalPayout || t.netPayment || 0;
        return acc;
      }, initMetrics());

      // Calculate Grubhub metrics
      const grubMetrics = filteredGrub.reduce((acc, t) => {
        const isPrepaidOrder = !t.transactionType || t.transactionType === "Prepaid Order";
        
        if (isPrepaidOrder) {
          acc.transactions += 1;
          const subtotal = t.subtotal || 0;
          const tax = t.subtotalSalesTax || 0;
          acc.salesInclTax += subtotal + tax;
          acc.salesExclTax += subtotal;
          acc.taxes += tax;
          acc.commissions += Math.abs(t.commission || 0);
          acc.restDeliveryCharge += t.deliveryCharge || 0;
          acc.promoSpend += Math.abs(t.merchantFundedPromotion || 0);
          acc.customerRefunds += Math.abs(t.refundAdjustment || 0);
          acc.customerTip += t.tip || 0;
          acc.restaurantFees += Math.abs(t.otherFees || 0);
        }
        
        // Net payout includes all transaction types
        acc.netPayout += t.merchantNetTotal || 0;
        return acc;
      }, initMetrics());

      // Calculate totals
      const totals = initMetrics();
      const platforms = [uberMetrics, doorMetrics, grubMetrics];
      
      for (const platform of platforms) {
        for (const key of Object.keys(totals) as Array<keyof PlatformMetrics>) {
          totals[key] += platform[key];
        }
      }

      // Calculate derived metrics
      const calculateDerived = (metrics: PlatformMetrics) => {
        const marketing = metrics.loyalty + metrics.adSpend + metrics.promoSpend + 
                         metrics.ddMarketingFee + metrics.merchantFundedDiscount + 
                         metrics.thirdPartyFundedDiscount;
        const others = metrics.customerTip + metrics.restaurantFees + 
                      metrics.miscellaneous + metrics.unaccounted;
        const costOfGoodsSold = metrics.salesInclTax * 0.46;
        const netMargin = metrics.netPayout - costOfGoodsSold;
        
        return {
          marketing,
          others,
          costOfGoodsSold,
          netMargin
        };
      };

      const response = {
        dateRange: { start, end },
        platforms: {
          uberEats: {
            ...uberMetrics,
            ...calculateDerived(uberMetrics)
          },
          doorDash: {
            ...doorMetrics,
            ...calculateDerived(doorMetrics)
          },
          grubhub: {
            ...grubMetrics,
            ...calculateDerived(grubMetrics)
          }
        },
        totals: {
          ...totals,
          ...calculateDerived(totals)
        }
      };

      res.json(response);
    } catch (error: any) {
      console.error("Income statement error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/export/weekly-financials", isAuthenticated, async (req, res) => {
    try {
      const { clientId, aggregation = "by-location" } = req.query;
      
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      const financials = await storage.getLocationWeeklyFinancialsByClient(clientId as string);
      const locations = await storage.getLocationsByClient(clientId as string);
      
      const locationMap = new Map(locations.map(loc => [loc.id, loc.canonicalName]));
      
      // Group financials by week to get all unique weeks
      const weekSet = new Set<string>();
      financials.forEach(f => weekSet.add(f.weekStartDate));
      const weeks = Array.from(weekSet).sort();
      
      // Create CSV content
      const csvRows: string[] = [];
      
      // Header row
      csvRows.push(['Location', 'Metric', ...weeks].join(','));
      
      if (aggregation === "overview") {
        // Aggregate all locations into overview
        const weeklyTotals = new Map<string, {
          sales: number;
          marketingSales: number;
          marketingSpend: number;
          payout: number;
          payoutWithCogs: number;
          count: number;
        }>();
        
        financials.forEach(f => {
          const existing = weeklyTotals.get(f.weekStartDate) || {
            sales: 0,
            marketingSales: 0,
            marketingSpend: 0,
            payout: 0,
            payoutWithCogs: 0,
            count: 0
          };
          
          weeklyTotals.set(f.weekStartDate, {
            sales: existing.sales + f.sales,
            marketingSales: existing.marketingSales + f.marketingSales,
            marketingSpend: existing.marketingSpend + f.marketingSpend,
            payout: existing.payout + f.payout,
            payoutWithCogs: existing.payoutWithCogs + f.payoutWithCogs,
            count: existing.count + 1
          });
        });
        
        // Calculate derived metrics
        const metrics = [
          'Total Net Sales',
          'Marketing Driven Sales',
          'Organic Sales',
          'Marketing Spend / Sales %',
          'Marketing ROAS',
          'Net Payout $',
          'Net Payout %',
          'Payout with COGS (46%)'
        ];
        
        metrics.forEach(metric => {
          const values = weeks.map(week => {
            const totals = weeklyTotals.get(week);
            if (!totals) return '';
            
            switch (metric) {
              case 'Total Net Sales':
                return `$${totals.sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Marketing Driven Sales':
                return `$${totals.marketingSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Organic Sales':
                return `$${(totals.sales - totals.marketingSales).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Marketing Spend / Sales %':
                return totals.sales > 0 ? `${((totals.marketingSpend / totals.sales) * 100).toFixed(0)}%` : '0%';
              case 'Marketing ROAS':
                return totals.marketingSpend > 0 ? (totals.marketingSales / totals.marketingSpend).toFixed(1) : '0';
              case 'Net Payout $':
                return `$${totals.payout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Net Payout %':
                return totals.sales > 0 ? `${((totals.payout / totals.sales) * 100).toFixed(0)}%` : '0%';
              case 'Payout with COGS (46%)':
                return `$${totals.payoutWithCogs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              default:
                return '';
            }
          });
          
          csvRows.push(['OVERVIEW', metric, ...values].join(','));
        });
      } else {
        // By location
        const locationGroups = new Map<string, any[]>();
        financials.forEach(f => {
          const name = locationMap.get(f.locationId) || f.locationId;
          if (!locationGroups.has(name)) {
            locationGroups.set(name, []);
          }
          locationGroups.get(name)!.push(f);
        });
        
        locationGroups.forEach((locFinancials, locationName) => {
          const weeklyData = new Map(locFinancials.map(f => [f.weekStartDate, f]));
          
          const metrics = [
            'Total Net Sales',
            'Marketing Driven Sales', 
            'Organic Sales',
            'Marketing Spend / Sales %',
            'Marketing ROAS',
            'Net Payout $',
            'Net Payout %',
            'Payout with COGS (46%)'
          ];
          
          metrics.forEach(metric => {
            const values = weeks.map(week => {
              const data = weeklyData.get(week);
              if (!data) return '';
              
              switch (metric) {
                case 'Total Net Sales':
                  return `$${data.sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Marketing Driven Sales':
                  return `$${data.marketingSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Organic Sales':
                  return `$${(data.sales - data.marketingSales).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Marketing Spend / Sales %':
                  return `${data.marketingPercent.toFixed(0)}%`;
                case 'Marketing ROAS':
                  return data.roas.toFixed(1);
                case 'Net Payout $':
                  return `$${data.payout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Net Payout %':
                  return `${data.payoutPercent.toFixed(0)}%`;
                case 'Payout with COGS (46%)':
                  return `$${data.payoutWithCogs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                default:
                  return '';
              }
            });
            
            csvRows.push([locationName, metric, ...values].join(','));
          });
        });
      }
      
      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="weekly-financials-${aggregation}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Diagnostic endpoint to match DoorDash legacy locations to verified master locations
  app.get("/api/diagnostic/match-legacy-locations", async (req, res) => {
    try {
      const allLocations = await storage.getAllLocations();
      
      // Get unverified master locations (legacy DoorDash + orphans)
      const legacyLocations = allLocations.filter(l => 
        l.locationTag === 'master' && 
        l.isVerified === false &&
        l.canonicalName !== 'Unmapped Locations'
      );
      
      // Get verified master locations
      const verifiedMasters = allLocations.filter(l => 
        l.locationTag === 'master' && 
        l.isVerified === true
      );
      
      // For each legacy location, find best match
      const matches = [];
      for (const legacy of legacyLocations) {
        let bestMatch: { location: any; confidence: number } | null = null;
        
        for (const master of verifiedMasters) {
          // Calculate similarity between names
          const confidence = calculateStringSimilarity(
            legacy.canonicalName.replace('Caps - ', ''),
            master.canonicalName.replace('Caps - ', '')
          );
          
          if (confidence >= 0.4 && (!bestMatch || confidence > bestMatch.confidence)) {
            bestMatch = { location: master, confidence };
          }
        }
        
        matches.push({
          legacyId: legacy.id,
          legacyName: legacy.canonicalName,
          matchedId: bestMatch?.location.id || null,
          matchedName: bestMatch?.location.canonicalName || null,
          matchedStoreId: bestMatch?.location.storeId || null,
          confidence: bestMatch?.confidence || 0
        });
      }
      
      // Sort by confidence descending
      matches.sort((a, b) => b.confidence - a.confidence);
      
      res.json(matches);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Migration payload validation schemas
  const migrationClientSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
  });

  const migrationLocationSchema = z.object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    canonicalName: z.string(),
    storeId: z.string().nullable(),
    ubereatsStoreLabel: z.string().nullable(),
    doordashStoreKey: z.string().nullable(),
    grubhubStoreNumber: z.string().nullable(),
    locationTag: z.string().nullable(),
    isVerified: z.boolean().nullable(),
  });

  const migrationUberEatsTransactionSchema = z.object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    locationId: z.string().uuid(),
    orderDate: z.string(),
    storeName: z.string().nullable(),
    subtotal: z.number().nullable(),
    salesExclTax: z.number().nullable(),
    otherPayments: z.number().nullable(),
    offersOnItems: z.number().nullable(),
    deliveryOfferRedemptions: z.number().nullable(),
    otherPaymentsDescription: z.string().nullable(),
    status: z.string().nullable(),
  });

  const migrationDoordashTransactionSchema = z.object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    locationId: z.string().uuid(),
    orderDate: z.string(),
    storeName: z.string().nullable(),
    subtotal: z.number().nullable(),
    otherPayments: z.number().nullable(),
    offersOnItems: z.number().nullable(),
    deliveryOfferRedemptions: z.number().nullable(),
    status: z.string().nullable(),
  });

  const migrationGrubhubTransactionSchema = z.object({
    id: z.string().uuid(),
    clientId: z.string().uuid(),
    locationId: z.string().uuid(),
    orderDate: z.string(),
    storeName: z.string().nullable(),
    subtotal: z.number().nullable(),
    status: z.string().nullable(),
  });

  const migrationPayloadSchema = z.object({
    version: z.string(),
    exportedAt: z.string(),
    data: z.object({
      clients: z.array(migrationClientSchema),
      locations: z.array(migrationLocationSchema),
      transactions: z.object({
        ubereats: z.array(migrationUberEatsTransactionSchema),
        doordash: z.array(migrationDoordashTransactionSchema),
        grubhub: z.array(migrationGrubhubTransactionSchema),
      }),
    }),
    stats: z.object({
      clientsCount: z.number(),
      locationsCount: z.number(),
      transactionsCount: z.number(),
    }),
  });

  // Data migration endpoints (super admin only)
  app.get("/api/admin/export-data", isSuperAdmin, async (req, res) => {
    try {
      // Export all database data for migration
      const dbStorage = storage as any; // Cast to access db and schema
      const [clients, locations, uberEatsTransactions, doordashTransactions, grubhubTransactions] = await Promise.all([
        storage.getAllClients(),
        storage.getAllLocations(),
        dbStorage.db.select().from(dbStorage.schema.uberEatsTransactions),
        dbStorage.db.select().from(dbStorage.schema.doordashTransactions),
        dbStorage.db.select().from(dbStorage.schema.grubhubTransactions),
      ]);

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        data: {
          clients,
          locations,
          transactions: {
            ubereats: uberEatsTransactions,
            doordash: doordashTransactions,
            grubhub: grubhubTransactions,
          },
        },
        stats: {
          clientsCount: clients.length,
          locationsCount: locations.length,
          transactionsCount: uberEatsTransactions.length + doordashTransactions.length + grubhubTransactions.length,
        },
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database-export-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error: any) {
      console.error('Export error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/import-data", isSuperAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let importData;
      try {
        importData = JSON.parse(req.file.buffer.toString('utf-8'));
      } catch (err) {
        return res.status(400).json({ error: 'Invalid JSON file' });
      }
      
      // Validate payload structure using Zod schema
      const validationResult = migrationPayloadSchema.safeParse(importData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid migration file structure',
          details: validationResult.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      
      // Use validated data
      importData = validationResult.data;

      const { clients, locations, transactions } = importData.data;
      const { stats } = importData;
      
      // Verify data integrity using checksums from export
      const expectedCounts = {
        clients: stats.clientsCount,
        locations: stats.locationsCount,
        transactions: stats.transactionsCount,
      };
      
      const actualCounts = {
        clients: clients?.length || 0,
        locations: locations?.length || 0,
        transactions: (transactions?.ubereats?.length || 0) + (transactions?.doordash?.length || 0) + (transactions?.grubhub?.length || 0),
      };
      
      if (actualCounts.clients !== expectedCounts.clients || 
          actualCounts.locations !== expectedCounts.locations ||
          actualCounts.transactions !== expectedCounts.transactions) {
        return res.status(400).json({ 
          error: 'Data corruption detected: counts do not match checksums',
          expected: expectedCounts,
          actual: actualCounts
        });
      }

      const dbStorage = storage as any; // Cast to access db and schema
      const db = dbStorage.db;
      
      // Fetch existing records to avoid duplicates and verify referential integrity
      const existingClients = await storage.getAllClients();
      const existingLocations = await storage.getAllLocations();
      const existingClientIds = new Set(existingClients.map(c => c.id));
      const existingLocationIds = new Set(existingLocations.map(l => l.id));
      
      // Track import results
      const results = {
        clients: { new: 0, skipped: 0, failed: 0 },
        locations: { new: 0, skipped: 0, failed: 0, orphaned: 0 },
        transactions: { new: 0, skipped: 0, failed: 0, orphaned: 0 },
      };
      
      // Use transaction for atomic import
      await db.transaction(async (tx: any) => {
        // Step 1: Import clients (parents first)
        for (const client of clients) {
          try {
            if (existingClientIds.has(client.id)) {
              results.clients.skipped++;
              continue;
            }
            
            await tx.insert(dbStorage.schema.clients).values(client);
            existingClientIds.add(client.id);
            results.clients.new++;
          } catch (err) {
            results.clients.failed++;
            throw new Error(`Failed to import client ${client.id}: ${err}`);
          }
        }
        
        // Step 2: Import locations (verify parent clients exist)
        for (const location of locations) {
          try {
            if (existingLocationIds.has(location.id)) {
              results.locations.skipped++;
              continue;
            }
            
            // Verify parent client exists
            if (!existingClientIds.has(location.clientId)) {
              results.locations.orphaned++;
              continue; // Skip orphaned locations
            }
            
            await tx.insert(dbStorage.schema.locations).values(location);
            existingLocationIds.add(location.id);
            results.locations.new++;
          } catch (err) {
            results.locations.failed++;
            throw new Error(`Failed to import location ${location.id}: ${err}`);
          }
        }
        
        // Step 3: Import transactions (verify parents exist)
        // Uber Eats
        for (const txn of transactions.ubereats || []) {
          try {
            // Verify referential integrity
            if (!existingClientIds.has(txn.clientId) || !existingLocationIds.has(txn.locationId)) {
              results.transactions.orphaned++;
              continue;
            }
            
            await tx.insert(dbStorage.schema.uberEatsTransactions)
              .values(txn)
              .onConflictDoNothing();
            results.transactions.new++;
          } catch (err) {
            results.transactions.failed++;
            // Don't throw here - continue with other transactions
          }
        }

        // DoorDash
        for (const txn of transactions.doordash || []) {
          try {
            if (!existingClientIds.has(txn.clientId) || !existingLocationIds.has(txn.locationId)) {
              results.transactions.orphaned++;
              continue;
            }
            
            await tx.insert(dbStorage.schema.doordashTransactions)
              .values(txn)
              .onConflictDoNothing();
            results.transactions.new++;
          } catch (err) {
            results.transactions.failed++;
          }
        }

        // Grubhub
        for (const txn of transactions.grubhub || []) {
          try {
            if (!existingClientIds.has(txn.clientId) || !existingLocationIds.has(txn.locationId)) {
              results.transactions.orphaned++;
              continue;
            }
            
            await tx.insert(dbStorage.schema.grubhubTransactions)
              .values(txn)
              .onConflictDoNothing();
            results.transactions.new++;
          } catch (err) {
            results.transactions.failed++;
          }
        }
      });
      
      // Check for failures
      if (results.clients.failed > 0 || results.locations.failed > 0) {
        return res.status(500).json({
          success: false,
          error: 'Import failed due to errors',
          results,
        });
      }

      res.json({
        success: true,
        results,
        summary: {
          clientsImported: results.clients.new,
          locationsImported: results.locations.new,
          transactionsImported: results.transactions.new,
          orphanedRecordsSkipped: results.locations.orphaned + results.transactions.orphaned,
        },
      });
    } catch (error: any) {
      console.error('Import error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
