import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          background: "#120d0b",
          color: "#ffbf00",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
          fontFamily: "serif"
        }}>
          <div style={{ maxWidth: "600px", background: "rgba(255,255,255,0.05)", padding: "40px", borderRadius: "24px", border: "1px solid rgba(255,191,0,0.2)" }}>
            <h1 style={{ fontSize: "2rem", marginBottom: "16px" }}>Üstad Bir Hata İle Karşılaştı</h1>
            <p style={{ color: "rgba(245,242,235,0.6)", marginBottom: "24px" }}>Uygulama yüklenirken teknik bir problem oluştu. İşte detaylar:</p>
            <div style={{ 
              background: "rgba(0,0,0,0.3)", 
              padding: "20px", 
              borderRadius: "12px", 
              textAlign: "left", 
              overflow: "auto",
              maxHeight: "200px",
              marginBottom: "32px",
              border: "1px solid rgba(255,255,255,0.1)"
            }}>
              <pre style={{ 
                margin: 0, 
                color: "#ff5555", 
                fontSize: "14px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all"
              }}>
                {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "16px 32px",
                borderRadius: "999px",
                border: "none",
                background: "#ffbf00",
                color: "#120d0b",
                fontWeight: "bold",
                fontSize: "12px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.3s"
              }}
            >
              Arşivi Yenile
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
