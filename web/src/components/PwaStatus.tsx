import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./ui/button";
import type { Copy } from "../i18n";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaStatus({ copy, locked }: { copy: Copy; locked: boolean }) {
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const installed = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <div className="pwa-status">
      {offlineReady && (
        <span>
          <WifiOff size={13} />
          {copy.offline}
        </span>
      )}
      {install && (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          <Download />
          {copy.install}
        </Button>
      )}
      {needRefresh && (
        <div role="status">
          <span>{copy.update}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={() => updateServiceWorker(true)}
          >
            {copy.reload}
          </Button>
        </div>
      )}
    </div>
  );
}
