import { TwinChromeThemeProvider } from "@/features/twin-chrome/TwinChromeThemeContext";
import TwinLayoutInner from "@/layouts/TwinLayoutInner";

export default function TwinLayout() {
    return (
        <TwinChromeThemeProvider>
            <TwinLayoutInner />
        </TwinChromeThemeProvider>
    );
}
