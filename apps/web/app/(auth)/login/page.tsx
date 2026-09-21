"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createTranslator, type Locale } from "@solar/i18n";
import { AlertCircle, Eye, EyeOff, Lock, Mail, ShieldCheck, Sun, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { authStore } from "../../../stores/auth-store";

const getInitialLocale = (): Locale => {
  if (typeof document === "undefined") return "th";
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return (match?.[1] as Locale) || "th";
};

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [locale, setLocaleState] = React.useState<Locale>("th");

  React.useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  const t = React.useMemo(() => createTranslator(locale), [locale]);

  const handleLocaleChange = (nextLocale: string) => {
    const loc = (nextLocale as Locale) || "th";
    setLocaleState(loc);
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
    setErrorMsg(null);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${baseUrl}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || t("auth.loginError"));
      }

      const data = await res.json();
      authStore.setAuth(data.user, data.accessToken);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || t("auth.loginError"));
    } finally {
      setIsLoading(false);
    }
  };

  const heroTitleLines = t("auth.heroTitle").split("\n");

  return (
    <div className="flex min-h-svh w-full flex-col lg:flex-row bg-background text-foreground">
      {/* Left Branding Panel with Hero Image */}
      <div className="relative hidden lg:flex lg:w-7/12 flex-col justify-between overflow-hidden p-12 text-white">
        {/* Background Image */}
        <img
          src="/login-hero.jpg"
          alt="Solar rooftop installation"
          className="absolute inset-0 h-full w-full object-cover object-center"
          aria-hidden="true"
        />

        {/* Ambient Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950/85 via-stone-900/80 to-stone-950/95 pointer-events-none" />

        {/* Subtle Decorative Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-20 pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20 shadow-inner">
            <Sun className="size-6 text-amber-300" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight">Solar Roof</span>
            <span className="block text-[11px] font-medium text-amber-200/80 uppercase tracking-widest">
              {t("app.platform")}
            </span>
          </div>
        </div>

        {/* Middle Hero Content */}
        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium backdrop-blur-md shadow-xs">
            <Zap className="size-3.5 text-amber-300" />
            <span>{t("auth.badge")}</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl leading-[1.15]">
            {heroTitleLines[0]} <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-400">
              {heroTitleLines[1] || ""}
            </span>
          </h1>

          <p className="text-sm text-amber-100/80 leading-relaxed">
            {t("auth.heroDesc")}
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/15">
            <div>
              <div className="text-2xl font-bold text-white">18+</div>
              <div className="text-xs text-amber-200/70">{t("auth.statSites")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">16.3 MWp</div>
              <div className="text-xs text-amber-200/70">{t("auth.statCapacity")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-amber-200/70">{t("auth.statSecurity")}</div>
            </div>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-amber-200/60 pt-6">
          <span>{t("auth.copyright")}</span>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-amber-300" />
            <span>{t("auth.securedBy")}</span>
          </div>
        </div>
      </div>

      {/* Right Login Form Panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16 lg:py-24">
        <div className="mx-auto w-full max-w-md space-y-8">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center gap-2.5 pb-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sun className="size-5" />
            </div>
            <div>
              <span className="font-bold text-base">Solar Roof</span>
              <span className="block text-[10px] text-muted-foreground uppercase tracking-widest">
                Platform
              </span>
            </div>
          </div>

          {/* Heading Row with Language Switcher Tabs aligned right */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                {t("auth.login")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("auth.subtitle")}
              </p>
            </div>

              <Tabs
              value={locale}
              onValueChange={handleLocaleChange}
              className="shrink-0"
            >
              <TabsList className="h-8">
                <TabsTrigger value="th" className="text-xs px-3 font-medium">
                  ไทย
                </TabsTrigger>
                <TabsTrigger value="en" className="text-xs px-3 font-medium">
                  EN
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form
            key={locale}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">
                {t("auth.email")}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t("auth.enterEmail")}
                  autoComplete="email"
                  className="pl-9 text-xs h-10"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium">
                  {t("auth.password")}
                </Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="pl-9 pr-9 text-xs h-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-semibold text-xs transition-all shadow-sm"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>{t("auth.signingIn")}</span>
                </div>
              ) : (
                t("auth.login")
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
