import { Database, Headphones, HelpCircle, Shield, Sparkles } from 'lucide-react';

export function Footer() {
  return (
    <footer className="ott-footer">
      <div className="footer-inner">
        {/* Customer Support & Quick Links */}
        <div className="footer-top-row">
          <div className="cs-callout">
            <div className="cs-badge">
              <Headphones size={16} />
              <span>고객센터 1588-0000</span>
            </div>
            <span className="cs-hours">운영시간: 365일 24시간 연중무휴 (시연용)</span>
          </div>

          <div className="footer-links-row">
            <a href="#notice" onClick={(e) => e.preventDefault()}>
              공지사항
            </a>
            <a href="#terms" onClick={(e) => e.preventDefault()}>
              이용약관
            </a>
            <a href="#privacy" className="privacy-highlight" onClick={(e) => e.preventDefault()}>
              개인정보처리방침
            </a>
            <a href="#youth" onClick={(e) => e.preventDefault()}>
              청소년보호정책
            </a>
            <a href="#faq" onClick={(e) => e.preventDefault()}>
              <HelpCircle size={13} /> 자주 묻는 질문
            </a>
          </div>
        </div>

        {/* Legal & Business Entity Info (Korean OTT standard) */}
        <div className="footer-corp-info">
          <p>
            <strong>SceneFlow (시즌플로우) 주식회사</strong> · 대표이사: Databricks AI Demo Team · 사업자등록번호:
            123-45-67890 · 통신판매업신고: 2026-서울강남-0000호
          </p>
          <p>
            주소: 서울특별시 강남구 테헤란로 123 데이터브릭스타워 18층 · 호스팅 서비스: Databricks Apps &amp; Serverless
            Lakehouse
          </p>
        </div>

        {/* Databricks Demo Compliance & Architecture Banner */}
        <div className="footer-databricks-notice">
          <div className="notice-left">
            <Database size={15} className="db-icon" />
            <span>
              <strong>Databricks Enterprise Architecture:</strong> Powered by Unity Catalog Governed Behavioral Lineage
              &amp; Foundation Model Endpoint (<code className="code-tag">databricks-qwen3-next-80b-a3b-instruct</code>
              ).
            </span>
          </div>
          <div className="security-tag">
            <Shield size={13} /> Read-Only Governed Sandbox
          </div>
        </div>

        {/* Copyright */}
        <div className="footer-bottom-row">
          <p className="copyright-text">
            © 2026 SceneFlow Inc. All rights reserved. 본 애플리케이션은 Databricks App 시연용으로 제작되었습니다.
          </p>
          <div className="brand-signature">
            <Sparkles size={13} /> Databricks Apps · React 19 · Serverless Lakehouse
          </div>
        </div>
      </div>
    </footer>
  );
}
