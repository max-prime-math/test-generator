/** Print an isolated document, leaving the application and its selected student intact. */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    const opener = document.activeElement as HTMLElement | null;
    const finish = () => { frame.remove(); if (opener?.isConnected) opener.focus(); };
    frame.title = 'Printable gradebook reports';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    let timeout: ReturnType<typeof setTimeout>;
    const fail = () => { frame.remove(); clearTimeout(timeout); reject(new Error('Printing could not open. Download the report and use your browser’s Print command.')); };
    frame.addEventListener('load', () => {
      clearTimeout(timeout);
      try {
        const target = frame.contentWindow;
        if (!target) { fail(); return; }
        target.addEventListener('afterprint', finish, { once: true });
        target.focus(); target.print(); resolve();
        setTimeout(() => { if (frame.isConnected) finish(); }, 60_000);
      } catch { fail(); }
    }, { once: true });
    frame.srcdoc = html;
    timeout = setTimeout(fail, 10_000);
    document.body.appendChild(frame);
  });
}
