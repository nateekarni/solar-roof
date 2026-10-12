import { toast } from "sonner";

export const notify = {
  success: (message: string, description?: string) => toast.success(message, description ? { description } : undefined),
  error: (message: string, description?: string) => {
    if(typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('form-submit-error', {detail:description ? message+' '+description : message}));
    return toast.error(message, description ? { description } : undefined);
  },
  warning: (message: string, description?: string) => toast.warning(message, description ? { description } : undefined),
  info: (message: string, description?: string) => toast.info(message, description ? { description } : undefined),
};
