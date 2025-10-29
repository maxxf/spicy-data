import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface OnboardingSession {
  id: string;
  messages: Message[];
  collectedData: any;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function Welcome() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { mutate: startSession, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      return await apiRequest<OnboardingSession>("POST", "/api/onboarding/start", {});
    },
    onSuccess: (data) => {
      setSessionId(data.id);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to start onboarding session",
      });
    },
  });

  const { data: session } = useQuery<OnboardingSession>({
    queryKey: ["/api/onboarding", sessionId],
    enabled: !!sessionId,
  });

  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: async (msg: string) => {
      return await apiRequest<OnboardingSession>("POST", `/api/onboarding/${sessionId}/message`, { message: msg });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", sessionId] });
      setMessage("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
      });
    },
  });

  const { mutate: completeOnboarding, isPending: isCompleting } = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/onboarding/${sessionId}/complete`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding", sessionId] });
      toast({
        title: "Onboarding Complete!",
        description: `Account created successfully. Please check ${data.email} for your login credentials.`,
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to complete onboarding. Please try again.",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages]);

  const handleSend = () => {
    if (message.trim() && sessionId) {
      sendMessage(message);
    }
  };

  const messages = session?.messages || [];
  const isComplete = session?.status === "completed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-teal-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-600" />
            <CardTitle>Welcome to Spicy Data Analytics</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Let's get your restaurant brand set up with our analytics platform. I'll guide you through the process.
          </p>
        </CardHeader>
        <CardContent className="p-6">
          {!sessionId ? (
            <div className="text-center space-y-4">
              <p className="text-lg">Ready to optimize your delivery operations?</p>
              <Button
                size="lg"
                onClick={() => startSession()}
                disabled={isStarting}
                data-testid="button-start-onboarding"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Start Onboarding
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <ScrollArea className="h-[400px] pr-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${msg.role}-${idx}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.role === "user"
                            ? "bg-teal-600 text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-foreground"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {isComplete ? (
                <div className="space-y-4">
                  <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                    <p className="font-medium text-teal-900 dark:text-teal-100">
                      Great! I've collected all the information needed.
                    </p>
                    <p className="text-sm text-teal-700 dark:text-teal-300 mt-2">
                      Click below to create your account and we'll send you login credentials via email.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={() => completeOnboarding()}
                    disabled={isCompleting}
                    className="w-full"
                    data-testid="button-complete-onboarding"
                  >
                    Complete Setup & Create Account
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isSending && handleSend()}
                    placeholder="Type your message..."
                    disabled={isSending}
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isSending || !message.trim()}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
