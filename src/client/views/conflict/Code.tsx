// A line of a conflicted file, as it is.

export function Code({ text }: { text: string }) {
  return <div className="min-h-[18px] px-2 whitespace-pre">{text || ' '}</div>;
}
