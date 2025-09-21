import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, AlertTriangle, Search, X, Info, Shield, FileText, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { searchICD10Codes, validateICD10Format, getCodeByCode, type ICD10Code } from "@shared/icd10Database";

interface DiagnosisInputProps {
  value?: string;
  onChange: (value: string, codeData?: ICD10Code) => void;
  onValidation?: (isValid: boolean, errors: string[], warnings: string[]) => void;
  onRecommendations?: (recommendations: ICD10Code['clinicalRecommendations']) => void;
  onComplianceChange?: (compliance: ICD10Code['medicareCompliance']) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showRecommendations?: boolean;
  showCompliance?: boolean;
  "data-testid"?: string;
}

// Debounce hook for search optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function DiagnosisInput({
  value = "",
  onChange,
  onValidation,
  onRecommendations,
  onComplianceChange,
  placeholder = "Search ICD-10 codes (e.g., E11.621, diabetic foot ulcer)",
  disabled = false,
  className,
  showRecommendations = true,
  showCompliance = true,
  "data-testid": testId = "diagnosis-input"
}: DiagnosisInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
  const [validationState, setValidationState] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>({ isValid: true, errors: [], warnings: [] });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedSearchTerm = useDebounce(inputValue, 300);

  // Search ICD-10 codes with debouncing
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["icd10-search", debouncedSearchTerm],
    queryFn: () => searchICD10Codes(debouncedSearchTerm),
    enabled: debouncedSearchTerm.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Validate input format and code existence
  useEffect(() => {
    if (inputValue.trim()) {
      const validation = validateICD10Format(inputValue.trim());
      setValidationState(validation);
      
      // Get code data if valid
      if (validation.isValid) {
        const codeData = getCodeByCode(inputValue.trim());
        setSelectedCode(codeData || null);
        
        // Notify parent components
        onValidation?.(validation.isValid, validation.errors, validation.warnings);
        onRecommendations?.(codeData?.clinicalRecommendations || null);
        onComplianceChange?.(codeData?.medicareCompliance || null);
      } else {
        setSelectedCode(null);
        onValidation?.(validation.isValid, validation.errors, validation.warnings);
        onRecommendations?.(null);
        onComplianceChange?.(null);
      }
    } else {
      setValidationState({ isValid: true, errors: [], warnings: [] });
      setSelectedCode(null);
      onValidation?.(true, [], []);
      onRecommendations?.(null);
      onComplianceChange?.(null);
    }
  }, [inputValue, onValidation, onRecommendations, onComplianceChange]);

  // Sync with external value changes
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue, selectedCode || undefined);
    
    // Open dropdown when typing
    if (newValue.length >= 2) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleCodeSelect = (code: ICD10Code) => {
    setInputValue(code.code);
    setSelectedCode(code);
    setIsOpen(false);
    onChange(code.code, code);
    
    // Notify parent components
    onRecommendations?.(code.clinicalRecommendations);
    onComplianceChange?.(code.medicareCompliance);
    
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setInputValue("");
    setSelectedCode(null);
    onChange("", undefined);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const getValidationIcon = () => {
    if (!inputValue.trim()) return null;
    
    if (validationState.isValid && selectedCode) {
      return <Check className="h-4 w-4 text-green-500" data-testid={`${testId}-valid-icon`} />;
    } else if (validationState.errors.length > 0) {
      return <AlertTriangle className="h-4 w-4 text-red-500" data-testid={`${testId}-error-icon`} />;
    } else if (validationState.warnings.length > 0) {
      return <AlertTriangle className="h-4 w-4 text-yellow-500" data-testid={`${testId}-warning-icon`} />;
    }
    
    return null;
  };

  const getInputBorderClass = () => {
    if (!inputValue.trim()) return "";
    
    if (validationState.isValid && selectedCode) {
      return "border-green-500 focus:border-green-500";
    } else if (validationState.errors.length > 0) {
      return "border-red-500 focus:border-red-500";
    } else if (validationState.warnings.length > 0) {
      return "border-yellow-500 focus:border-yellow-500";
    }
    
    return "";
  };

  return (
    <div className={cn("relative", className)} data-testid={testId}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={() => inputValue.length >= 2 && setIsOpen(true)}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                "pr-20", // Space for icons
                getInputBorderClass()
              )}
              data-testid={`${testId}-field`}
            />
            
            {/* Icons container */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isSearching && (
                <div className="animate-spin h-4 w-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              
              {getValidationIcon()}
              
              {inputValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleClear}
                  data-testid={`${testId}-clear`}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </PopoverTrigger>
        
        <PopoverContent 
          className="w-[500px] p-0" 
          align="start"
          data-testid={`${testId}-dropdown`}
        >
          <ScrollArea className="max-h-96">
            {searchResults && searchResults.length > 0 ? (
              <div className="p-2">
                {searchResults.map((code, index) => (
                  <div
                    key={code.code}
                    className="p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer rounded-md transition-colors"
                    onClick={() => handleCodeSelect(code)}
                    data-testid={`${testId}-option-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-medium text-sm">
                            {code.code}
                          </span>
                          <Badge 
                            variant={code.isWoundRelated ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {code.category}
                          </Badge>
                          {code.medicareCompliance.isLCDCovered && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              LCD
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {code.description}
                        </p>
                        
                        {code.laterality && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {code.laterality}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : debouncedSearchTerm.length >= 2 && !isSearching ? (
              <div className="p-4 text-center text-muted-foreground" data-testid={`${testId}-no-results`}>
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No diagnosis codes found matching "{debouncedSearchTerm}"</p>
                <p className="text-xs mt-1">Try searching with ICD-10 codes or clinical terms</p>
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Type at least 2 characters to search</p>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Validation Messages */}
      {(validationState.errors.length > 0 || validationState.warnings.length > 0) && (
        <div className="mt-2 space-y-1" data-testid={`${testId}-validation-messages`}>
          {validationState.errors.map((error, index) => (
            <Alert key={`error-${index}`} variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {error}
              </AlertDescription>
            </Alert>
          ))}
          
          {validationState.warnings.map((warning, index) => (
            <Alert key={`warning-${index}`} className="py-2 border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-sm text-yellow-800">
                {warning}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Selected Code Details */}
      {selectedCode && (showRecommendations || showCompliance) && (
        <div className="mt-4 space-y-3" data-testid={`${testId}-details`}>
          {/* Code Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Selected Diagnosis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{selectedCode.code}</span>
                <Badge variant="outline">{selectedCode.category}</Badge>
                {selectedCode.laterality && (
                  <Badge variant="secondary" className="capitalize">
                    {selectedCode.laterality}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedCode.description}
              </p>
            </CardContent>
          </Card>

          {/* Medicare Compliance */}
          {showCompliance && selectedCode.medicareCompliance && (
            <Card data-testid={`${testId}-compliance`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Medicare LCD Compliance
                  <Badge 
                    variant={selectedCode.medicareCompliance.isLCDCovered ? "default" : "destructive"}
                    className="ml-auto"
                  >
                    {selectedCode.medicareCompliance.isLCDCovered ? "Covered" : "Not Covered"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedCode.medicareCompliance.lcdNumbers && (
                  <div>
                    <p className="text-sm font-medium mb-1">LCD Numbers:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedCode.medicareCompliance.lcdNumbers.map((lcd, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {lcd}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedCode.medicareCompliance.frequencyLimitations && (
                  <div>
                    <p className="text-sm font-medium mb-1">Frequency Limitations:</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCode.medicareCompliance.frequencyLimitations}
                    </p>
                  </div>
                )}

                {selectedCode.medicareCompliance.coverage_conditions && (
                  <div>
                    <p className="text-sm font-medium mb-2">Coverage Conditions:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {selectedCode.medicareCompliance.coverage_conditions.map((condition, index) => (
                        <li key={index} className="flex items-start gap-1">
                          <span className="inline-block w-1 h-1 bg-current rounded-full mt-2 flex-shrink-0" />
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Clinical Recommendations */}
          {showRecommendations && selectedCode.clinicalRecommendations && (
            <Card data-testid={`${testId}-recommendations`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Clinical Recommendations
                  {selectedCode.clinicalRecommendations.evidence_level && (
                    <Badge variant="outline" className="ml-auto">
                      Evidence Level {selectedCode.clinicalRecommendations.evidence_level}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedCode.clinicalRecommendations.immediate_care && (
                  <div>
                    <p className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-red-500" />
                      Immediate Care:
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {selectedCode.clinicalRecommendations.immediate_care.map((care, index) => (
                        <li key={index} className="flex items-start gap-1">
                          <span className="inline-block w-1 h-1 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                          {care}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedCode.clinicalRecommendations.conservative_care && (
                  <div>
                    <p className="text-sm font-medium mb-2">Conservative Care:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {selectedCode.clinicalRecommendations.conservative_care.map((care, index) => (
                        <li key={index} className="flex items-start gap-1">
                          <span className="inline-block w-1 h-1 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                          {care}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedCode.clinicalRecommendations.contraindications && (
                  <div>
                    <p className="text-sm font-medium mb-2 text-red-600">
                      Contraindications:
                    </p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {selectedCode.clinicalRecommendations.contraindications.map((contra, index) => (
                        <li key={index} className="flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          {contra}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}