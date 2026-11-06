// A file's diff (`diff`), parsed into hunks of lines with their numbers,
// with images before and after; and a file's content (`blob`).

export interface Line {
  kind: ' ' | '+' | '-';
  old?: number;
  new?: number;
  /** Without its mark, exactly (a CRLF file's lines end with '\r'). */
  text: string;
  /** “\ No newline at end of file” follows this line. */
  noNewline?: true;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  section?: string;
  lines: Line[];
}

export interface Blob {
  size: number;
  /** Base64. */
  data?: string;
  tooLarge?: boolean;
}

export interface Diff {
  path: string;
  oldPath?: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T';
  similarity?: number;
  oldMode?: string;
  newMode?: string;
  binary: boolean;
  image?: { mime: string; before: Blob | null; after: Blob | null };
  tooLarge?: boolean;
  truncated: boolean;
  size: number;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  submodule?: { before: string | null; after: string | null };
}

export interface BlobContent {
  size: number;
  binary: boolean;
  lines?: string[];
  total?: number;
  data?: string;
}
