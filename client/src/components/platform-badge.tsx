import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Platform = "ubereats" | "doordash" | "grubhub";

interface PlatformBadgeProps {
  platform: Platform;
  className?: string;
}

const platformConfig = {
  ubereats: {
    label: "Uber Eats",
    className: "bg-platform-uber/10 text-platform-uber border-platform-uber/20 hover:bg-platform-uber/20",
  },
  doordash: {
    label: "DoorDash",
    className: "bg-platform-doordash/10 text-platform-doordash border-platform-doordash/20 hover:bg-platform-doordash/20",
  },
  grubhub: {
    label: "Grubhub",
    className: "bg-platform-grubhub/10 text-platform-grubhub border-platform-grubhub/20 hover:bg-platform-grubhub/20",
  },
};

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const config = platformConfig[platform];

  return (
    <Badge
      variant="outline"
      className={cn(config.className, "font-medium no-default-hover-elevate", className)}
      data-testid={`badge-platform-${platform}`}
    >
      {config.label}
    </Badge>
  );
}
