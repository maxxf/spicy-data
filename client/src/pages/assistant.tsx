import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useClientContext } from "@/contexts/client-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Send,
  UtensilsCrossed,
  Activity,
  Megaphone,
  DollarSign,
  TrendingUp,
  MapPin,
} from "lucide-react";
import { useLocation } from "wouter";
import type { Client } from "@shared/schema";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const shortcuts = [
  { label: "Menu Performance", icon: UtensilsCrossed, url: "/menu-performance", description: "Sales rankings & AOV" },
  { label: "Ops Signals", icon: Activity, url: "/ops-signals", description: "Operational health" },
  { label: "Campaigns", icon: Megaphone, url: "/campaigns", description: "Marketing ROI" },
  { label: "Profitability", icon: DollarSign, url: "/profitability", description: "Payouts & margins" },
];

const suggestedQuestions = [
  "What were our top 5 locations by sales last week?",
  "Which platform has the best ROAS right now?",
  "Show me locations with low payout percentages",
  "How is our marketing spend trending vs. sales?",
  "Which locations need attention based on recent performance?",
  "Compare DoorDash vs Uber Eats profitability",
];

export default function AssistantPage() {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const hasMessages = messages.length > 0;

  const { selectedClientId, selectedPlatforms } = useClientContext();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const selectedClient = clients?.find((c) => c.id === selectedClientId);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/assistant/chat", {
        message,
        history: messages,
        clientId: selectedClientId,
        platforms: selectedPlatforms,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      setIsTyping(false);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm sorry, I couldn't process that request. Please try again." },
      ]);
      setIsTyping(false);
    },
  });

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isTyping) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInputValue("");
    setIsTyping(true);
    chatMutation.mutate(trimmed);
  };

  const handleShortcut = (url: string) => {
    navigate(url);
  };

  const handleSuggestion = (question: string) => {
    setInputValue(question);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setIsTyping(true);
    chatMutation.mutate(question);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const contextLabel = selectedClient
    ? selectedClient.name
    : "All Clients";

  const platformLabel = selectedPlatforms.length === 3
    ? "All Platforms"
    : selectedPlatforms.map((p) => p === "ubereats" ? "UE" : p === "doordash" ? "DD" : "GH").join(", ");

  return (
    <div className="flex flex-col h-full" data-testid="assistant-page">
      {!hasMessages ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-2xl flex flex-col items-center gap-8">
            <div className="text-center">
              <h1 className="text-3xl font-light text-foreground mb-2" data-testid="text-assistant-heading">
                What can I help with?
              </h1>
              <p className="text-sm text-muted-foreground">
                Analyzing {contextLabel} across {platformLabel}
              </p>
            </div>

            <div className="w-full relative">
              <div className="flex items-center gap-2 border rounded-md bg-card px-4 py-2">
                <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask about sales, campaigns, locations, profitability..."
                  className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                  data-testid="input-assistant-chat"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="secondary" className="text-xs gap-1 cursor-default">
                    <Sparkles className="w-3 h-3" />
                    AI
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isTyping}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              {shortcuts.map((shortcut) => (
                <Button
                  key={shortcut.label}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleShortcut(shortcut.url)}
                  data-testid={`button-shortcut-${shortcut.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <shortcut.icon className="w-3.5 h-3.5" />
                  {shortcut.label}
                </Button>
              ))}
            </div>

            <div className="w-full max-w-xl mt-4">
              <p className="text-xs text-muted-foreground mb-3 text-center">Suggested questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedQuestions.map((question, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(question)}
                    className="text-left text-sm p-3 rounded-md border bg-card text-foreground hover-elevate transition-colors"
                    data-testid={`button-suggestion-${i}`}
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-2xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.role}-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-md px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex gap-3 justify-start" data-testid="typing-indicator">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                  <div className="bg-card border rounded-md px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t bg-background px-6 py-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 border rounded-md bg-card px-4 py-2">
                <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask a follow-up question..."
                  className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                  data-testid="input-assistant-followup"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isTyping}
                  data-testid="button-send-followup"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
