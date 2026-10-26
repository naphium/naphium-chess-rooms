const links = [
  { label: "Facebook", href: "https://www.facebook.com/naphium" },
  { label: "Instagram", href: "https://www.instagram.com/nafim.exe" },
  { label: "GitHub", href: "https://github.com/mdnafimmuttaki" },
  { label: "Website", href: "https://nafim.vercel.app" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-sm text-muted-foreground md:flex-row md:justify-between">
        <p>
          Naphium Chess — created by{" "}
          <span className="font-medium text-foreground">Md. Nafim Muttaki</span>
        </p>
        <div className="flex flex-col items-center gap-2 md:items-end">
          <span className="text-xs uppercase tracking-widest text-primary">Support & Socials</span>
          <nav className="flex flex-wrap justify-center gap-4">
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
