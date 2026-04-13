import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Upload, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
  validate?: (val: string) => string | null; // returns error message or null
}

export interface ImportResult {
  success: number;
  skipped: number;
  errors: { row: number; field: string; message: string }[];
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  columns: ColumnDef[];
  sampleData: Record<string, string>[];
  onImport: (rows: Record<string, string>[], mode: "skip" | "overwrite") => Promise<ImportResult>;
}

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function generateCSV(columns: ColumnDef[], sampleData: Record<string, string>[]): string {
  const header = columns.map((c) => c.label).join(",");
  const rows = sampleData.map((row) =>
    columns.map((c) => `"${(row[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  return [header, ...rows].join("\n");
}

const BulkImportDialog = ({ open, onOpenChange, title, columns, sampleData, onImport }: BulkImportDialogProps) => {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; field: string; message: string }[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite">("skip");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setParsedRows([]);
    setValidationErrors([]);
    setImportResult(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const downloadTemplate = () => {
    const csv = generateCSV(columns, sampleData);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) {
        toast.error("File must have a header row and at least one data row");
        return;
      }
      const headerRow = rows[0].map((h) => h.toLowerCase().trim());
      // Map header to column keys
      const keyMap: Record<number, string> = {};
      columns.forEach((col) => {
        const idx = headerRow.findIndex(
          (h) => h === col.label.toLowerCase() || h === col.key.toLowerCase()
        );
        if (idx >= 0) keyMap[idx] = col.key;
      });

      const dataRows = rows.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        Object.entries(keyMap).forEach(([idx, key]) => {
          obj[key] = row[Number(idx)] ?? "";
        });
        return obj;
      });

      // Validate
      const errors: { row: number; field: string; message: string }[] = [];
      dataRows.forEach((row, i) => {
        columns.forEach((col) => {
          if (col.required && !row[col.key]?.trim()) {
            errors.push({ row: i + 2, field: col.label, message: "Required" });
          }
          if (col.validate && row[col.key]?.trim()) {
            const err = col.validate(row[col.key]);
            if (err) errors.push({ row: i + 2, field: col.label, message: err });
          }
        });
      });

      setParsedRows(dataRows);
      setValidationErrors(errors);
      setStep("preview");
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await onImport(parsedRows, duplicateMode);
      setImportResult(result);
      setStep("result");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const validRows = parsedRows.length - new Set(validationErrors.map((e) => e.row)).size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {title}</DialogTitle>
          <DialogDescription>Upload a CSV file to bulk import data.</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Template
              </Button>
              <span className="text-xs text-muted-foreground">Download the CSV template, fill your data, then upload</span>
            </div>
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drop your CSV file here or click to browse</p>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="max-w-xs mx-auto"
                onChange={handleFileUpload}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <strong>Required fields:</strong>{" "}
              {columns.filter((c) => c.required).map((c) => c.label).join(", ")}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline">{parsedRows.length} rows</Badge>
              <Badge variant={validationErrors.length > 0 ? "destructive" : "default"}>
                {validationErrors.length} errors
              </Badge>
              <Badge variant="secondary">{validRows} valid</Badge>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Duplicates:</span>
                <Select value={duplicateMode} onValueChange={(v: "skip" | "overwrite") => setDuplicateMode(v)}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip</SelectItem>
                    <SelectItem value="overwrite">Overwrite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 max-h-28 overflow-y-auto">
                {validationErrors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    Row {e.row}: {e.field} — {e.message}
                  </p>
                ))}
                {validationErrors.length > 20 && (
                  <p className="text-xs text-muted-foreground mt-1">...and {validationErrors.length - 20} more</p>
                )}
              </div>
            )}

            <div className="flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {columns.map((c) => (
                      <TableHead key={c.key} className="text-xs">{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 50).map((row, i) => {
                    const rowErrors = validationErrors.filter((e) => e.row === i + 2);
                    return (
                      <TableRow key={i} className={rowErrors.length > 0 ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        {columns.map((c) => {
                          const hasErr = rowErrors.some((e) => e.field === c.label);
                          return (
                            <TableCell key={c.key} className={`text-xs ${hasErr ? "text-destructive font-medium" : ""}`}>
                              {row[c.key] || "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {parsedRows.length > 50 && (
                <p className="text-xs text-muted-foreground p-2 text-center">Showing first 50 of {parsedRows.length} rows</p>
              )}
            </div>
          </div>
        )}

        {step === "result" && importResult && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">{importResult.success} imported</span>
              </div>
              {importResult.skipped > 0 && (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-semibold">{importResult.skipped} skipped</span>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold">{importResult.errors.length} failed</span>
                </div>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    Row {e.row}: {e.field} — {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport} disabled={importing || validRows === 0}>
                {importing ? "Importing…" : `Import ${validRows} rows`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkImportDialog;
