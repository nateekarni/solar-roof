"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createTranslator, type Locale } from "@solar/i18n";
import { AlertCircle, Eye, EyeOff, Lock, Mail, Sun, LoaderCircle } from "lucide-react";

import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Card, CardContent } from "../../../components/ui/card";
import { authStore } from "../../../stores/auth-store";

const getInitialLocale = (): Locale => {
  if (typeof document === "undefined") return "th";
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return (match?.[1] as Locale) || "th";
};

export default function LoginPage() {

  const [showPassword, setShowPassword] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [locale, setLocaleState] = React.useState<Locale>("th");

  React.useEffect(() => {
    setLocaleState(getInitialLocale());

    // Security: Immediately sanitize and remove any leaked credentials from URL query string
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.has("email") || params.has("password")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  const t = React.useMemo(() => createTranslator(locale), [locale]);

  const handleLocaleChange = (nextLocale: string) => {
    const loc = (nextLocale as Locale) || "th";
    setLocaleState(loc);
    clearErrors();
    document.cookie = `locale=${loc}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const loginSchema = React.useMemo(
    () =>
      z.object({
        email: z
          .string()
          .min(1, t("auth.emailRequired"))
          .email(t("auth.emailInvalid")),
        password: z.string().min(1, t("auth.passwordRequired")),
      }),
    [t]
  );

  type LoginFormValues = z.infer<typeof loginSchema>;

  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const res = await fetch("/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("inactive")) {
          setErrorKey("auth.accountInactive");
        } else if (msg.includes("email and password are required")) {
          setErrorKey("auth.emailRequired");
        } else {
          setErrorKey("auth.loginError");
        }
        return;
      }

      const data = await res.json();
      authStore.setAuth(data.user, data.accessToken);
      // Hard navigation ensures all cookies are immediately active in the document context
      window.location.replace("/");
    } catch {
      setErrorKey("auth.serverError");
    } finally {
      setIsLoading(false);
    }
  };


  const th = locale === "th";
  return <main className="grid min-h-svh bg-muted/30 text-foreground lg:grid-cols-2">
    <section className="relative hidden min-h-svh overflow-hidden lg:flex lg:flex-col lg:justify-end" aria-label={th ? "แพลตฟอร์มพลังงานแสงอาทิตย์" : "Solar energy platform"}>
      <img src="/login-hero.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover"/>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10"/>
      <div className="relative space-y-5 px-10 py-16 xl:px-16">
        <span className="inline-flex rounded-full bg-primary/15 px-4 py-2 text-sm font-medium">{th ? "แพลตฟอร์มบริหารพลังงานแสงอาทิตย์" : "Solar energy management platform"}</span>
        <h2 className="max-w-lg text-3xl font-semibold leading-snug tracking-tight xl:text-4xl">{th ? "ติดตามพลังงานและจัดการการเรียกเก็บเงิน" : "Monitor energy and manage billing"}</h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{th ? "เชื่อมต่อไซต์งาน ดูข้อมูลจากมิเตอร์ และจัดการเอกสารการเรียกเก็บเงินในที่เดียว" : "Connect your sites, view meter readings and manage billing documents in one place."}</p>
        <p className="pt-6 text-xs text-muted-foreground">{t("auth.copyright")}</p>
      </div>
    </section>
    <section className="flex min-w-0 flex-col px-4 py-5 sm:px-8 sm:py-8">
      <div className="flex justify-end"><Tabs value={locale} onValueChange={handleLocaleChange}><TabsList className="h-10 group-data-horizontal/tabs:h-10 bg-muted" aria-label={th ? "ภาษา" : "Language"}><TabsTrigger value="th" className="px-4">ไทย</TabsTrigger><TabsTrigger value="en" className="px-4">EN</TabsTrigger></TabsList></Tabs></div>
      <div className="flex flex-1 items-start justify-center py-8 sm:items-center sm:py-10">
        <Card className="w-full max-w-[420px] rounded-2xl shadow-sm"><CardContent className="space-y-7 p-6 sm:p-8">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sun aria-hidden="true" className="size-6"/></div><div><p className="text-lg font-semibold">Solar Platform</p><p className="text-xs text-muted-foreground">{th ? "ระบบบริหารพลังงานแสงอาทิตย์" : "Solar energy management"}</p></div></div>
          <div className="space-y-2"><h1 className="text-2xl font-semibold tracking-tight">{t("auth.login")}</h1><p className="text-sm leading-relaxed text-muted-foreground">{t("auth.subtitle")}</p></div>
          {errorKey && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0"/><span>{t(errorKey)}</span></div>}
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5" aria-busy={isLoading}>
            <div className="space-y-2"><Label htmlFor="email" className="text-sm">{t("auth.email")}</Label><div className="relative"><Mail aria-hidden="true" className="pointer-events-none absolute left-[calc(0.75rem+1px)] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="email" type="email" autoComplete="username" placeholder={t("auth.enterEmail")} className="h-10 pl-10 text-sm" aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")}/></div>{errors.email && <p id="email-error" role="alert" className="text-sm text-destructive">{errors.email.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="password" className="text-sm">{t("auth.password")}</Label><div className="relative"><Lock aria-hidden="true" className="pointer-events-none absolute left-[calc(0.75rem+1px)] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={th ? "กรอกรหัสผ่าน" : "Enter your password"} className="h-10 pl-10 pr-12 text-sm" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")}/><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 size-10 text-muted-foreground" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden="true" className="size-4"/> : <Eye aria-hidden="true" className="size-4"/>}</Button></div>{errors.password && <p id="password-error" role="alert" className="text-sm text-destructive">{errors.password.message}</p>}</div>
            <Button type="submit" disabled={isLoading} className="h-10 w-full text-sm font-medium">{isLoading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin"/>}{isLoading ? t("auth.signingIn") : t("auth.login")}</Button>
          </form>
        </CardContent></Card>
      </div>
    </section>
  </main>;
}
