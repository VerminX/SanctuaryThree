import { Bell, Clock, Shield, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <header className="bg-card border-b border-border p-6" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="header-title">
            {title}
          </h1>
          {subtitle && (
            <p className="text-muted-foreground" data-testid="header-subtitle">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {/* Notification Bell */}
          <button 
            className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full text-xs flex items-center justify-center text-destructive-foreground">
              3
            </span>
          </button>
          
          {/* Session Timer */}
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span data-testid="session-timer">Session: 14:27</span>
          </div>
          
          {/* Security Badge */}
          <Badge variant="outline" className="bg-muted px-3 py-1">
            <Shield className="w-3 h-3 mr-2 text-chart-2" />
            <span className="text-xs font-medium">2FA Active</span>
          </Badge>

          {/* Logout Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
