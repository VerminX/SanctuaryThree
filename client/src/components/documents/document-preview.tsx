import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Download, 
  Edit, 
  Save, 
  Eye, 
  X,
  Check,
  Clock,
  User,
  Calendar
} from "lucide-react";

interface DocumentPreviewProps {
  document: {
    id: string;
    title: string;
    type: string;
    status: string;
    currentVersion: number;
    patientName?: string;
    patientMrn?: string;
    createdAt: string;
    createdBy: string;
  };
  currentVersion?: {
    id: string;
    content: string;
    version: number;
    citations: any[];
    changeLog?: string;
    createdAt: string;
    createdBy: string;
  };
  onClose: () => void;
  onSave?: (content: string, changeLog: string) => void;
}

export default function DocumentPreview({
  document,
  currentVersion,
  onClose,
  onSave
}: DocumentPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(currentVersion?.content || "");
  const [changeLog, setChangeLog] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setEditedContent(currentVersion?.content || "");
  }, [currentVersion]);

  const saveVersionMutation = useMutation({
    mutationFn: async ({ content, changeLog }: { content: string; changeLog: string }) => {
      const response = await apiRequest("POST", `/api/documents/${document.id}/versions`, {
        content,
        changeLog,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${document.id}/versions`] });
      queryClient.invalidateQueries({ queryKey: ["/api/all-documents"] });
      setIsEditing(false);
      setChangeLog("");
      toast({
        title: "Version Saved",
        description: "Document has been updated successfully",
      });
      onSave?.(editedContent, changeLog);
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save document version. Please try again.",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ format }: { format: 'PDF' | 'DOCX' }) => {
      const response = await apiRequest("GET", `/api/documents/${document.id}/export/${format}`);
      return await response.blob();
    },
    onSuccess: (blob, variables) => {
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${document.title}.${variables.format.toLowerCase()}`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Export Complete",
        description: `Document exported as ${variables.format}`,
      });
    },
    onError: () => {
      toast({
        title: "Export Failed",
        description: "Failed to export document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (editedContent.trim() && changeLog.trim()) {
      saveVersionMutation.mutate({ content: editedContent, changeLog });
    } else {
      toast({
        title: "Missing Information",
        description: "Please provide content and change log description",
        variant: "destructive",
      });
    }
  };

  const handleExport = (format: 'PDF' | 'DOCX') => {
    exportMutation.mutate({ format });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "pending_approval":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "signed":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "draft":
        return <Edit className="h-3 w-3" />;
      case "pending_approval":
        return <Clock className="h-3 w-3" />;
      case "approved":
        return <Check className="h-3 w-3" />;
      case "signed":
        return <User className="h-3 w-3" />;
      case "rejected":
        return <X className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" data-testid="document-preview-modal">
      <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileText className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{document.title}</h2>
              <div className="flex items-center space-x-3 mt-1">
                <Badge className={getStatusColor(document.status)}>
                  {getStatusIcon(document.status)}
                  <span className="ml-1 capitalize">{document.status.replace('_', ' ')}</span>
                </Badge>
                <span className="text-sm text-muted-foreground">
                  v{document.currentVersion}
                </span>
                {document.patientName && (
                  <span className="text-sm text-muted-foreground">
                    {document.patientName} (MRN: {document.patientMrn})
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  data-testid="button-edit-document"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('PDF')}
                  disabled={exportMutation.isPending}
                  data-testid="button-export-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('DOCX')}
                  disabled={exportMutation.isPending}
                  data-testid="button-export-docx"
                >
                  <Download className="h-4 w-4 mr-2" />
                  DOCX
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveVersionMutation.isPending}
                  data-testid="button-save-document"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveVersionMutation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedContent(currentVersion?.content || "");
                    setChangeLog("");
                  }}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="content" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mx-6 mt-4">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="citations">Citations</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-auto p-6">
              <TabsContent value="content" className="mt-0 h-full">
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Document Content
                      </label>
                      <Textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="min-h-[400px] font-mono text-sm"
                        placeholder="Enter document content..."
                        data-testid="textarea-document-content"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Change Log
                      </label>
                      <Textarea
                        value={changeLog}
                        onChange={(e) => setChangeLog(e.target.value)}
                        className="h-20"
                        placeholder="Describe the changes made in this version..."
                        data-testid="textarea-change-log"
                      />
                    </div>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-6">
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                        {currentVersion?.content || "No content available"}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="citations" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">References & Citations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentVersion?.citations && currentVersion.citations.length > 0 ? (
                      <div className="space-y-4">
                        {currentVersion.citations.map((citation: any, index: number) => (
                          <div key={index} className="border border-border rounded-lg p-4">
                            <h4 className="font-medium text-foreground">{citation.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {citation.section}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <a
                                href={citation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {citation.url}
                              </a>
                              <span className="text-xs text-muted-foreground">
                                Effective: {citation.effectiveDate}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        No citations available
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="metadata" className="mt-0">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Document Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Document Type</label>
                        <p className="text-foreground">{document.type}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Current Version</label>
                        <p className="text-foreground">v{document.currentVersion}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Created</label>
                        <p className="text-foreground flex items-center">
                          <Calendar className="h-4 w-4 mr-2" />
                          {new Date(document.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Created By</label>
                        <p className="text-foreground flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          {document.createdBy}
                        </p>
                      </div>
                    </div>
                    
                    {currentVersion && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-foreground mb-2">Current Version Info</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Version Created</label>
                            <p className="text-foreground">
                              {new Date(currentVersion.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Created By</label>
                            <p className="text-foreground">{currentVersion.createdBy}</p>
                          </div>
                        </div>
                        {currentVersion.changeLog && (
                          <div className="mt-2">
                            <label className="text-sm font-medium text-muted-foreground">Change Log</label>
                            <p className="text-foreground mt-1">{currentVersion.changeLog}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}