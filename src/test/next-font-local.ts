// next/font/local is a compile-time transform in Next; under vitest it resolves to this inert stand-in.
export default function localFont() {
  return { className: "", variable: "", style: { fontFamily: "serif" } };
}
