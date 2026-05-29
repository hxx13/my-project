/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                student: {
                    primary: "var(--student-primary)",
                    'primary-soft': "var(--student-primary-soft)",
                    ink: "var(--student-ink)",
                    body: "var(--student-body)",
                    mute: "var(--student-mute)",
                    canvas: "var(--student-canvas)",
                    'canvas-soft': "var(--student-canvas-soft)",
                    hairline: "var(--student-hairline)",
                    success: "var(--student-success)",
                    error: "var(--student-error)",
                    warning: "var(--student-warning)",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                'twin-xs': '4px',
                'twin-sm': '6px',
                'twin-md': '8px',
                'twin-lg': '12px',
                'twin-xl': '16px',
                'twin-pill': '100px',
                'twin-full': '9999px',
                'student-xs': "var(--student-radius-xs)",
                'student-sm': "var(--student-radius-sm)",
                'student-md': "var(--student-radius-md)",
                'student-lg': "var(--student-radius-lg)",
                'student-pill': "var(--student-radius-pill)",
                'student-full': "var(--student-radius-full)",
            },
            boxShadow: {
                'twin-level-1': '0 0 0 1px rgba(0,0,0,0.08) inset',
                'twin-level-2': '0 1px 1px rgba(0,0,0,0.02), 0 2px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-3': '0 2px 2px rgba(0,0,0,0.04), 0 8px 8px -8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-4': '0 2px 2px rgba(0,0,0,0.04), 0 8px 16px -4px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'twin-level-5': '0 1px 1px rgba(0,0,0,0.02), 0 8px 16px -4px rgba(0,0,0,0.04), 0 24px 32px -8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.08)',
                'student-card': "var(--student-shadow-card)",
                'student-card-hover': "var(--student-shadow-card-hover)",
                'student-modal': "var(--student-shadow-modal)",
            },
            keyframes: {
                blob: {
                    "0%": { transform: "translate(0px, 0px) scale(1)" },
                    "33%": { transform: "translate(30px, -50px) scale(1.1)" },
                    "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
                    "100%": { transform: "translate(0px, 0px) scale(1)" },
                },
                'skeleton-pulse': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.4' },
                },
                'fade-in': {
                    '0%': { opacity: '0', transform: 'translateY(4px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                blob: "blob 10s infinite alternate",
                'skeleton-pulse': 'skeleton-pulse 1.8s ease-in-out infinite',
                'fade-in': 'fade-in 0.3s ease-out',
            }
        },
    },
    plugins: [],
}