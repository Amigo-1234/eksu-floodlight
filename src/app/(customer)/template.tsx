/** Re-mounts on every navigation inside this area, giving each page a soft entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
