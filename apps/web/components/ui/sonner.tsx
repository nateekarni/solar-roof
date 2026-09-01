"use client"

import type { CSSProperties } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ theme: propTheme, ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const resolvedTheme = propTheme ?? theme ?? "system"
  const sonnerProps = { ...props, theme: resolvedTheme as ToasterProps["theme"] } as ToasterProps

  return <Sonner {...sonnerProps} className="toaster group" icons={{ success: <CircleCheckIcon />, info: <InfoIcon />, warning: <TriangleAlertIcon />, error: <OctagonXIcon />, loading: <Loader2Icon className="animate-spin" /> }} style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--normal-border": "var(--border)", "--border-radius": "var(--radius)" } as CSSProperties} toastOptions={{ classNames: { toast: "cn-toast" } }} />
}

export { Toaster }
