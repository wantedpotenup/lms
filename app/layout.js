import "./globals.css";

export const metadata = {
  title: "학습 결과 조회",
  description: "개인 학습 결과(테스트/프로젝트 평가) 조회 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
