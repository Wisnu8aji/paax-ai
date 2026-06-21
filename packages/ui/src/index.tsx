import React from "react";

// ─── Placeholder UI Components ───────────────────────────────────────────────
// These are scaffold components. Real implementations will use Tailwind + shadcn/ui.

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({ children, variant = "primary", size = "md", loading, ...props }: ButtonProps) {
  return (
    <button data-variant={variant} data-size={size} disabled={loading || props.disabled} {...props}>
      {loading ? "Loading..." : children}
    </button>
  );
}

export interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({ title, children, className, padding = "md" }: CardProps) {
  return (
    <div className={className} data-padding={padding}>
      {title && <h3>{title}</h3>}
      <div>{children}</div>
    </div>
  );
}

export interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return <span data-variant={variant}>{children}</span>;
}

export interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const variant =
    status === "COMPLETED" || status === "APPROVED"
      ? "success"
      : status === "FAILED" || status === "REJECTED"
        ? "error"
        : status === "IN_PROGRESS" || status === "PROCESSING"
          ? "info"
          : "default";
  return <Badge variant={variant}>{label || status}</Badge>;
}

export interface WarningBadgeProps {
  level: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message?: string;
}

export function WarningBadge({ level, message }: WarningBadgeProps) {
  const variant =
    level === "CRITICAL" || level === "HIGH"
      ? "error"
      : level === "MEDIUM"
        ? "warning"
        : "info";
  return (
    <Badge variant={variant}>
      {level}
      {message ? `: ${message}` : ""}
    </Badge>
  );
}

export interface DataTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: string;
    render?: (item: T) => React.ReactNode;
  }[];
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <div>{emptyMessage}</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, i) => (
          <tr key={i} onClick={() => onRowClick?.(item)}>
            {columns.map((col) => (
              <td key={col.key}>
                {col.render ? col.render(item) : String(item[col.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface AppShellProps {
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, header, children }: AppShellProps) {
  return (
    <div data-component="app-shell">
      {header && <header>{header}</header>}
      <div style={{ display: "flex" }}>
        {sidebar && <aside>{sidebar}</aside>}
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}

export interface ChatPanelProps {
  messages: { role: string; content: string }[];
  onSend?: (message: string) => void;
  placeholder?: string;
  isLoading?: boolean;
}

export function ChatPanel({
  messages,
  onSend: _onSend,
  placeholder = "Type a message...",
  isLoading = false,
}: ChatPanelProps) {
  return (
    <div data-component="chat-panel">
      <div>
        {messages.map((msg, i) => (
          <div key={i} data-role={msg.role}>
            {msg.content}
          </div>
        ))}
        {isLoading && <div>Thinking...</div>}
      </div>
      <input type="text" placeholder={placeholder} disabled={isLoading} />
    </div>
  );
}

export interface PDFViewerProps {
  url: string;
  pageNumber?: number;
  highlights?: { x: number; y: number; width: number; height: number }[];
  onPageChange?: (page: number) => void;
}

export function PDFViewer({ url, pageNumber = 1, onPageChange: _onPageChange }: PDFViewerProps) {
  return (
    <div data-component="pdf-viewer">
      <div>PDF Viewer Placeholder</div>
      <div>URL: {url}</div>
      <div>Page: {pageNumber}</div>
    </div>
  );
}
