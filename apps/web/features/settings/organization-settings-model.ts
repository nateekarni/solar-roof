export function validateOrganizationPassword(
  password: string,
  confirmation: string,
  locale: "th" | "en",
): string | null {
  if (password.length < 12 || password.length > 128)
    return locale === "th"
      ? "รหัสผ่านใหม่ต้องมี 12 ถึง 128 ตัวอักษร"
      : "New password must contain between 12 and 128 characters.";
  if (password !== confirmation)
    return locale === "th"
      ? "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน"
      : "Passwords do not match.";
  return null;
}
export async function submitOwnPasswordChange(
  current: string,
  password: string,
  confirmation: string,
  locale: "th" | "en",
  actions: {
    update: (body: {
      currentPassword: string;
      newPassword: string;
    }) => Promise<unknown>;
    clear: () => void;
    redirect: (path: string) => void;
  },
) {
  const error = validateOrganizationPassword(password, confirmation, locale);
  if (error) throw new Error(error);
  await actions.update({ currentPassword: current, newPassword: password });
  actions.clear();
  actions.redirect("/login?password_changed=1");
}
