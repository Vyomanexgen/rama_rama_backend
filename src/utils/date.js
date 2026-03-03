const isValidIsoDate = (value) => {
  if (!value || typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
};

const toIsoDate = (date) => {
  if (typeof date === "string" && isValidIsoDate(date)) return date;
  return new Date(date).toISOString().split("T")[0];
};

const getTodayIso = () => toIsoDate(new Date());

const getDateRange = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
  };
};

const getDayBounds = (dateStr) => {
  const date = isValidIsoDate(dateStr) ? new Date(dateStr + "T00:00:00.000Z") : new Date();
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
};

module.exports = {
  isValidIsoDate,
  toIsoDate,
  getTodayIso,
  getDateRange,
  getDayBounds,
};
