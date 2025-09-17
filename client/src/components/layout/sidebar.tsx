import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
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
  Moon,
  TestTube2,
  Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigationItems = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/encounters", label: "Encounters", icon: ClipboardList },
  { href: "/upload", label: "PDF Upload", icon: Upload },
  { href: "/eligibility", label: "Eligibility Analysis", icon: SearchCheck },
  { href: "/documents", label: "Document Generation", icon: FileText },
  { href: "/policies", label: "Policy Database", icon: Book },
  { href: "/audit", label: "Audit Logs", icon: Shield },
  { href: "/validation", label: "System Validation", icon: TestTube2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

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
        {navigationItems.map((item) => {
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
        })}
      </nav>

      {/* Footer Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
            <span className="text-xs text-muted-foreground">HIPAA Compliant</span>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <Moon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
