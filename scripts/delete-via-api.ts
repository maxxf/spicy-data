const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const WEEK_START = "2025-09-29";
const WEEK_END = "2025-10-05";

async function deleteDataViaAPI() {
  const url = `http://localhost:5000/api/transactions?clientId=${CAPRIOTTIS_ID}&startDate=${WEEK_START}&endDate=${WEEK_END}`;
  
  console.log(`Deleting transactions via API: ${url}`);
  
  const response = await fetch(url, {
    method: "DELETE",
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

deleteDataViaAPI().catch(console.error);
