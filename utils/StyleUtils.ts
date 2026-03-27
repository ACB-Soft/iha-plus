
export const getAccuracyColor = (acc: number | null) => {
  if (acc === null) return "text-slate-300";
  if (acc <= 10) return "text-emerald-500";
  if (acc <= 20) return "text-amber-500";
  return "text-rose-500";
};

export const getAccuracyBg = (acc: number | null) => {
  if (acc === null) return "bg-slate-100 border-slate-200";
  if (acc <= 10) return "bg-emerald-100 border-emerald-200";
  if (acc <= 20) return "bg-amber-100 border-amber-200";
  return "bg-rose-100 border-rose-200";
};
