import ReactMarkdown from "react-markdown";

const STYLES = [
  "text-[15px] leading-relaxed text-ink",
  "[&>*:last-child]:mb-0 [&_p]:mb-3",
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1",
  "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold",
  "[&_strong]:font-semibold [&_a]:text-cyan [&_a]:underline",
  "[&_code]:rounded [&_code]:bg-panel-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]",
  "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-panel-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
].join(" ");

export default function Markdown({ children }: { children: string }) {
  return (
    <div className={STYLES}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
