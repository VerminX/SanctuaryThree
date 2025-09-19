import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertCircle, XCircle, Info, Shield, Activity } from "lucide-react";

interface DataQualityIndicatorProps {
  score?: number; // 0-100
  completeness?: number; // 0-100
  missingFields?: string[];
  warnings?: string[];
  confidence?: number; // 0-1
  validationStatus?: 'valid' | 'partial' | 'invalid';
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
}

export function DataQualityIndicator({
  score,
  completeness,
  missingFields = [],
  warnings = [],
  confidence,
  validationStatus,
  size = 'md',
  showDetails = true
}: DataQualityIndicatorProps) {
  // Calculate overall quality based on available metrics
  const calculateOverallQuality = () => {
    let total = 0;
    let count = 0;
    
    if (score !== undefined) {
      total += score;
      count++;
    }
    
    if (completeness !== undefined) {
      total += completeness;
      count++;
    }
    
    if (confidence !== undefined) {
      total += confidence * 100;
      count++;
    }
    
    if (count === 0) return null;
    return total / count;
  };
  
  const overallQuality = calculateOverallQuality();
  
  const getQualityColor = (quality: number) => {
    if (quality >= 90) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (quality >= 75) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    if (quality >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  };
  
  const getQualityIcon = (quality: number) => {
    if (quality >= 90) return <CheckCircle2 className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />;
    if (quality >= 75) return <Shield className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />;
    if (quality >= 60) return <AlertCircle className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />;
    return <XCircle className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />;
  };
  
  const getValidationBadge = () => {
    switch (validationStatus) {
      case 'valid':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Valid
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            <AlertCircle className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case 'invalid':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
            <XCircle className="w-3 h-3 mr-1" />
            Invalid
          </Badge>
        );
      default:
        return null;
    }
  };
  
  if (!overallQuality && !validationStatus && missingFields.length === 0) {
    return null;
  }
  
  return (
    <TooltipProvider>
      <div className={`flex ${size === 'lg' ? 'flex-col' : 'flex-row'} items-${size === 'lg' ? 'start' : 'center'} gap-${size === 'sm' ? '2' : '3'}`} data-testid="data-quality-indicator">
        
        {/* Overall Quality Score */}
        {overallQuality !== null && (
          <div className={`flex items-center gap-2 ${getQualityColor(overallQuality)} px-2 py-1 rounded`}>
            {getQualityIcon(overallQuality)}
            <span className={`font-medium ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
              {Math.round(overallQuality)}%
            </span>
            {size !== 'sm' && <span className="text-xs opacity-75">Quality</span>}
          </div>
        )}
        
        {/* Completeness Progress */}
        {completeness !== undefined && showDetails && size !== 'sm' && (
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col">
              <div className="text-xs text-muted-foreground">Completeness</div>
              <Progress value={completeness} className="w-20 h-2" />
            </div>
            <span className="text-xs font-medium">{completeness}%</span>
          </div>
        )}
        
        {/* Confidence Badge */}
        {confidence !== undefined && showDetails && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className={size === 'sm' ? 'text-xs' : ''}>
                {Math.round(confidence * 100)}% confident
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>AI extraction confidence score</p>
            </TooltipContent>
          </Tooltip>
        )}
        
        {/* Validation Status */}
        {validationStatus && showDetails && getValidationBadge()}
        
        {/* Missing Fields Indicator */}
        {missingFields.length > 0 && showDetails && (
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                <Info className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
                <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
                  {missingFields.length} missing
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">Missing fields:</p>
                <ul className="text-xs space-y-0.5">
                  {missingFields.map((field, idx) => (
                    <li key={idx}>• {field}</li>
                  ))}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
        
        {/* Warnings Indicator */}
        {warnings.length > 0 && showDetails && (
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <AlertCircle className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
                <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
                  {warnings.length} warning{warnings.length > 1 ? 's' : ''}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">Warnings:</p>
                <ul className="text-xs space-y-0.5">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

// Compact version for table cells or list items
export function DataQualityBadge({
  score,
  completeness,
  confidence
}: Pick<DataQualityIndicatorProps, 'score' | 'completeness' | 'confidence'>) {
  const value = score || completeness || (confidence ? confidence * 100 : 0);
  
  const getVariant = () => {
    if (value >= 90) return 'default';
    if (value >= 75) return 'secondary';
    if (value >= 60) return 'outline';
    return 'destructive';
  };
  
  return (
    <Badge variant={getVariant()} className="text-xs" data-testid="data-quality-badge">
      {Math.round(value)}%
    </Badge>
  );
}