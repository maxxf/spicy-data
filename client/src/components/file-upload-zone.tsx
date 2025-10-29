import { useCallback, useState } from "react";
import { Upload, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PlatformBadge } from "./platform-badge";

type Platform = "ubereats" | "doordash" | "grubhub";

type UploadStatus = {
  status: 'idle' | 'uploading' | 'success' | 'error';
  rowsProcessed?: number;
  error?: string;
};

interface FileUploadZoneProps {
  platform: Platform;
  onFileSelect: (file: File, platform: Platform) => void;
  onFileClear?: (platform: Platform) => void;
  isProcessing?: boolean;
  uploadStatus?: UploadStatus;
  progress?: number;
  error?: string;
  className?: string;
}

export function FileUploadZone({
  platform,
  onFileSelect,
  onFileClear,
  isProcessing = false,
  uploadStatus,
  progress = 0,
  error,
  className,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const csvFile = files.find((f) => f.name.endsWith(".csv"));

      if (csvFile) {
        setSelectedFile(csvFile);
        onFileSelect(csvFile, platform);
      }
    },
    [onFileSelect, platform]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.name.endsWith(".csv")) {
        setSelectedFile(file);
        onFileSelect(file, platform);
      }
    },
    [onFileSelect, platform]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    if (onFileClear) {
      onFileClear(platform);
    }
  }, [onFileClear, platform]);

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        isDragOver && "border-primary bg-primary/5",
        error && "border-destructive",
        className
      )}
      data-testid={`card-upload-${platform}`}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <PlatformBadge platform={platform} />
          {selectedFile && !isProcessing && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearFile}
              data-testid={`button-clear-file-${platform}`}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {!selectedFile ? (
          <label
            htmlFor={`file-input-${platform}`}
            className={cn(
              "flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 cursor-pointer hover-elevate transition-colors",
              isDragOver ? "border-primary bg-primary/5" : "border-border"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid={`zone-dropzone-${platform}`}
          >
            <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">
              Drop CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground text-center">
              {platform === "ubereats" && "Upload Uber Eats Payment Report (CSV export from Manager > Payments)"}
              {platform === "doordash" && "Upload DoorDash Store Statement (CSV export from Financials > Store Statements)"}
              {platform === "grubhub" && "Upload Grubhub Transaction Report (CSV export from Reports > Transactions)"}
            </p>
            <input
              id={`file-input-${platform}`}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
              data-testid={`input-file-${platform}`}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-md bg-muted/50">
              <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid={`text-filename-${platform}`}>
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>

            {uploadStatus?.status === 'uploading' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Processing...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} data-testid={`progress-upload-${platform}`} />
              </div>
            )}

            {uploadStatus?.status === 'success' && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" data-testid={`alert-success-${platform}`}>
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700 dark:text-green-300">
                  <p className="font-medium">Upload successful</p>
                  {uploadStatus.rowsProcessed && (
                    <p className="text-xs mt-0.5">Processed {uploadStatus.rowsProcessed.toLocaleString()} transactions</p>
                  )}
                </div>
              </div>
            )}

            {(uploadStatus?.status === 'error' || error) && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid={`alert-error-${platform}`}>
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{uploadStatus?.error || error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
