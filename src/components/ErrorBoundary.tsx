import { Component, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const IS_PRODUCTION = import.meta.env.PROD;

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always log internally; never expose to UI
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-2" />
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {IS_PRODUCTION
                  ? "An unexpected error occurred. Please try again or contact support."
                  : this.state.error?.message || "An unexpected error occurred."}
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={this.handleReset}>Try Again</Button>
                <Button variant="outline" onClick={() => window.location.assign("/")}>
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
