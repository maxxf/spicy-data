import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Percent, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPromotionSchema, type PromotionMetrics, type Client } from "@shared/schema";
import type { z } from "zod";

const platformColors = {
  ubereats: "bg-[#45B85A] hover:bg-[#3A9A4A]",
  doordash: "bg-[#FF3008] hover:bg-[#E62B07]",
  grubhub: "bg-[#F86734] hover:bg-[#E6582C]",
};

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
};

type InsertPromotionForm = z.infer<typeof insertPromotionSchema>;

export default function PromotionsPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: promotions, isLoading } = useQuery<PromotionMetrics[]>({
    queryKey: ["/api/analytics/promotions"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertPromotionForm) => apiRequest("POST", "/api/promotions", data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Promotion created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create promotion",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/promotions/${id}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Promotion deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/promotions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete promotion",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertPromotionForm>({
    resolver: zodResolver(insertPromotionSchema),
    defaultValues: {
      clientId: "",
      name: "",
      platforms: [],
      type: "discount",
      status: "scheduled",
      startDate: "",
      endDate: "",
      discountPercent: undefined,
      discountAmount: undefined,
    },
  });

  const onSubmit = (data: InsertPromotionForm) => {
    createMutation.mutate(data);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Promotions & Offers
            </h1>
            <p className="text-muted-foreground mt-1">
              Track promotional campaigns and their performance
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8" data-testid="page-promotions">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Promotions & Offers
          </h1>
          <p className="text-muted-foreground mt-1">
            Track promotional campaigns and their performance
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-promotion">
              <Plus className="w-4 h-4 mr-2" />
              Create Promotion
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Promotion</DialogTitle>
              <DialogDescription>
                Set up a new promotional campaign across delivery platforms
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-client">
                            <SelectValue placeholder="Select a client" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Promotion Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Summer Sale 2025"
                          {...field}
                          data-testid="input-promotion-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="platforms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platforms</FormLabel>
                      <div className="flex gap-4">
                        {[
                          { id: "ubereats", label: "Uber Eats" },
                          { id: "doordash", label: "DoorDash" },
                          { id: "grubhub", label: "Grubhub" },
                        ].map((platform) => (
                          <div key={platform.id} className="flex items-center space-x-2">
                            <Checkbox
                              checked={field.value?.includes(platform.id)}
                              onCheckedChange={(checked) => {
                                const currentValue = field.value || [];
                                if (checked) {
                                  field.onChange([...currentValue, platform.id]);
                                } else {
                                  field.onChange(
                                    currentValue.filter((p: string) => p !== platform.id)
                                  );
                                }
                              }}
                              data-testid={`checkbox-platform-${platform.id}`}
                            />
                            <label className="text-sm cursor-pointer">
                              {platform.label}
                            </label>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-promotion-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="discount">Discount</SelectItem>
                            <SelectItem value="bogo">Buy One Get One</SelectItem>
                            <SelectItem value="free-delivery">Free Delivery</SelectItem>
                            <SelectItem value="bundle">Bundle Deal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-promotion-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="discountPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount % (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 20"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                            }
                            data-testid="input-discount-percent"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="discountAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount $ (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 10"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                            }
                            data-testid="input-discount-amount"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Promotion"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {promotions && promotions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Percent className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state">
              No promotions yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first promotional campaign to start tracking performance
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first">
              <Plus className="w-4 h-4 mr-2" />
              Create Promotion
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Promotions</CardTitle>
            <CardDescription>
              {promotions?.length || 0} promotional campaigns across all clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue Impact</TableHead>
                  <TableHead className="text-right">Discount Cost</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions?.map((promotion) => {
                  const client = clients?.find((c) => c.id === promotion.clientId);
                  return (
                    <TableRow key={promotion.id}>
                      <TableCell className="font-medium" data-testid={`text-promotion-name-${promotion.id}`}>
                        {promotion.name}
                      </TableCell>
                      <TableCell data-testid={`text-client-${promotion.id}`}>
                        {client?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {promotion.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[promotion.status as keyof typeof statusColors] || statusColors.scheduled}
                        >
                          {promotion.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{promotion.startDate}</div>
                        {promotion.endDate && (
                          <div className="text-muted-foreground">to {promotion.endDate}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-orders-${promotion.id}`}>
                        {promotion.orders.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(promotion.revenueImpact)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(promotion.discountCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {promotion.roi > 0 ? (
                          <span className="text-green-600 dark:text-green-400 flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {formatPercent(promotion.roi)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(promotion.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${promotion.id}`}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
