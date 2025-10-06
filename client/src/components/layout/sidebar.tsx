import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { 
  Heart, 
  BarChart3, 
  Users, 
  ClipboardList, 
  SearchCheck, 
  FileText, 
  Book, 
  Shield, 
  Settings,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  TestTube2,
  Upload,
  Calendar,
  TrendingUp,
  FileBarChart,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useState } from "react";

// Main navigation items in requested order
const mainNavigationItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/upload", label: "PDF Upload", icon: Upload },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/episodes", label: "Episodes", icon: Calendar },
  { href: "/encounters", label: "Encounters", icon: ClipboardList },
  { href: "/eligibility", label: "Eligibility Analysis", icon: SearchCheck },
  { href: "/documents", label: "Document Generation", icon: FileText },
];

// "Other" dropdown items
const otherNavigationItems = [
  { href: "/policies", label: "Policy Database", icon: Book },
  { href: "/audit", label: "Audit Logs", icon: Shield },
  { href: "/validation", label: "System Validation", icon: TestTube2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/analytics", label: "Analytics Dashboard", icon: TrendingUp },
  { href: "/reports", label: "Reports & Exports", icon: FileBarChart },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOtherOpen, setIsOtherOpen] = useState(false);

  // Defensive check to ensure navigation items are properly defined
  if (!mainNavigationItems || !otherNavigationItems) {
    console.error('Navigation items not properly defined in sidebar');
    return (
      <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
        <div className="p-6 border-b border-border">
          <div className="text-center text-destructive">
            <p>Sidebar configuration error. Please refresh the page.</p>
          </div>
        </div>
      </aside>
    );
  }

  // Get user's display name and role
  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user?.email?.split('@')[0] || 'User';
  
  const currentTenant = user?.tenants?.[0];
  const userRole = currentTenant ? 'Admin' : 'User'; // This would come from tenant relationship

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo/Brand Section */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Heart className="text-primary-foreground text-lg" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-foreground">WoundCare Portal</h1>
            <p className="text-sm text-muted-foreground">Pre-Determination System</p>
          </div>
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
            {user?.profileImageUrl ? (
              <img 
                src={user.profileImageUrl} 
                alt="Profile" 
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <span className="text-accent-foreground text-sm font-medium">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground" data-testid="user-name">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="user-role">
              {userRole} • {currentTenant ? 'Clinic Admin' : 'User'}
            </p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2" data-testid="navigation">
        {/* Main Navigation Items */}
        {(mainNavigationItems || []).map((item) => {
          if (!item || !item.href || !item.label || !item.icon) {
            console.warn('Invalid navigation item:', item);
            return null;
          }
          
          const isActive = location === item.href || 
            (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start space-x-3 p-3 h-auto",
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Button>
            </Link>
          );
        }).filter(Boolean)}

        {/* Other Section Dropdown */}
        <Collapsible open={isOtherOpen} onOpenChange={setIsOtherOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start space-x-3 p-3 h-auto text-muted-foreground hover:text-foreground hover:bg-muted"
              data-testid="nav-dropdown-other"
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="font-medium flex-1 text-left">Other</span>
              {isOtherOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-1">
            {(otherNavigationItems || []).map((item) => {
              if (!item || !item.href || !item.label || !item.icon) {
                console.warn('Invalid other navigation item:', item);
                return null;
              }
              
              const isActive = location === item.href || 
                (item.href !== "/" && location.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start space-x-3 p-2 pl-8 h-auto text-sm",
                      isActive
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                    data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{item.label}</span>
                  </Button>
                </Link>
              );
            }).filter(Boolean)}
          </CollapsibleContent>
        </Collapsible>
      </nav>

      {/* Footer Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
            <span className="text-xs text-muted-foreground">HIPAA Compliant</span>
          </div>
          <button 
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-toggle-theme"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
