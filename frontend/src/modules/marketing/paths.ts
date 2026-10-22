/** Public page of the wheel: the link sent to each client in the WhatsApp campaigns. */
export const PUBLIC_ROULETTE_PATH = '/ruleta/:token';

export const publicRoulettePath = (token: string) => `/ruleta/${token}`;

/** Address of the public pages put in the messages (the server adds /ruleta/<token>). */
export const publicBaseUrl = () => (import.meta.env.VITE_PUBLIC_URL || window.location.origin).replace(/\/$/, '');
