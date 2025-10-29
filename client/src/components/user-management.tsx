import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Shield, User as UserIcon, Building2 } from "lucide-react";
import type { User, Client } from "@shared/schema";

const roleColors = {
  super_admin: "bg-purple-500/20 text-purple-700 dark:text-purple-300",
  brand_admin: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  user: "bg-gray-500/20 text-gray-700 dark:text-gray-300",
};

const roleIcons = {
  super_admin: Shield,
  brand_admin: Building2,
  user: UserIcon,
};

const roleLabels = {
  super_admin: "Super Admin",
  brand_admin: "Brand Admin",
  user: "User",
};

export function UserManagement() {
  const { toast } = useToast();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [newClientId, setNewClientId] = useState<string | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, clientId }: { userId: string; role: string; clientId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/role`, { role, clientId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "User role and permissions have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUserId(null);
      setNewRole("");
      setNewClientId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User deleted",
        description: "User has been removed from the system.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const handleStartEdit = (user: User) => {
    setEditingUserId(user.id);
    setNewRole(user.role);
    setNewClientId(user.clientId || null);
  };

  const handleSaveEdit = (userId: string) => {
    if (!newRole) return;
    
    const finalClientId = newRole === "brand_admin" ? newClientId : null;
    updateRoleMutation.mutate({ userId, role: newRole, clientId: finalClientId });
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setNewRole("");
    setNewClientId(null);
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "-";
    const client = clients?.find(c => c.id === clientId);
    return client?.name || "Unknown";
  };

  if (usersLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Loading users...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          Manage user roles and permissions. Brand admins can only access data for their assigned client.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Assigned Client</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => {
                const isEditing = editingUserId === user.id;
                const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] || UserIcon;
                const isCurrentUser = currentUser?.id === user.id;

                return (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.profileImageUrl && (
                          <img 
                            src={user.profileImageUrl} 
                            alt={`${user.firstName} ${user.lastName}`}
                            className="w-8 h-8 rounded-full"
                          />
                        )}
                        <div>
                          <div className="font-medium" data-testid={`text-username-${user.id}`}>
                            {user.firstName} {user.lastName}
                            {isCurrentUser && (
                              <Badge variant="outline" className="ml-2">You</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`text-email-${user.id}`}>{user.email}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Select
                          value={newRole}
                          onValueChange={setNewRole}
                          data-testid={`select-role-${user.id}`}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin" data-testid="option-super-admin">
                              Super Admin
                            </SelectItem>
                            <SelectItem value="brand_admin" data-testid="option-brand-admin">
                              Brand Admin
                            </SelectItem>
                            <SelectItem value="user" data-testid="option-user">
                              User
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge 
                          className={roleColors[user.role as keyof typeof roleColors]}
                          data-testid={`badge-role-${user.id}`}
                        >
                          <RoleIcon className="w-3 h-3 mr-1" />
                          {roleLabels[user.role as keyof typeof roleLabels]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-client-${user.id}`}>
                      {isEditing && newRole === "brand_admin" ? (
                        <Select
                          value={newClientId || ""}
                          onValueChange={(value) => setNewClientId(value || null)}
                          data-testid={`select-client-${user.id}`}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select client..." />
                          </SelectTrigger>
                          <SelectContent>
                            {clients?.map((client) => (
                              <SelectItem 
                                key={client.id} 
                                value={client.id}
                                data-testid={`option-client-${client.id}`}
                              >
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        getClientName(user.clientId)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(user.id)}
                              disabled={updateRoleMutation.isPending}
                              data-testid={`button-save-${user.id}`}
                            >
                              {updateRoleMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              disabled={updateRoleMutation.isPending}
                              data-testid={`button-cancel-${user.id}`}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStartEdit(user)}
                              disabled={isCurrentUser}
                              data-testid={`button-edit-${user.id}`}
                            >
                              Edit Role
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isCurrentUser}
                                  data-testid={`button-delete-${user.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete {user.firstName} {user.lastName}? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid={`button-cancel-delete-${user.id}`}>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                    data-testid={`button-confirm-delete-${user.id}`}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {users && users.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No users found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
