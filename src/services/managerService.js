const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const normalizeStatus = (status) => {
  if (!status) return null;
  const v = String(status).trim().toLowerCase();
  if (v === "half day" || v === "halfday") return "half-day";
  return v;
};

const getAssignedEmployees = async (db, manager) => {
  const byIdSnap = await db
    .collection("employees")
    .where("managerId", "==", manager.uid)
    .get();

  let byEmailSnap = { empty: true, docs: [] };
  if (manager.email) {
    byEmailSnap = await db
      .collection("employees")
      .where("managerEmail", "==", manager.email)
      .get();
  }

  const map = new Map();
  for (const doc of byIdSnap.docs) map.set(doc.id, { id: doc.id, ...doc.data() });
  for (const doc of byEmailSnap.docs) map.set(doc.id, { id: doc.id, ...doc.data() });

  return Array.from(map.values());
};

const getAttendanceByDateForEmployees = async (db, date, employeeIds, options = {}) => {
  if (!employeeIds.length) return [];
  const results = [];

  for (const id of employeeIds) {
    const snap = await db
      .collection("attendance")
      .where("employeeId", "==", id)
      .get();

    snap.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() };
      if (data.date !== date) return;
      if (options.managerVerified === true && !data.managerVerified) return;
      results.push(data);
    });
  }

  return results;
};

const getAttendanceByDateRangeForEmployees = async (db, start, end, employeeIds, options = {}) => {
  if (!employeeIds.length) return [];
  const results = [];

  for (const id of employeeIds) {
    const snap = await db
      .collection("attendance")
      .where("employeeId", "==", id)
      .get();

    snap.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() };
      if (data.date < start || data.date > end) return;
      if (options.managerVerified === true && !data.managerVerified) return;
      results.push(data);
    });
  }

  return results;
};

const getLocationLogsForEmployees = async (db, date, employeeIds, getDayBounds) => {
  if (!employeeIds.length) return [];
  const chunks = chunkArray(employeeIds, 10);
  const results = [];
  const { start, end } = getDayBounds(date);

  for (const ids of chunks) {
    for (const id of ids) {
      const snap = await db
        .collection("locationLogs")
        .where("employeeId", "==", id)
        .get();

      snap.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        const ts = data.timestamp || data.createdAt || data.loggedAt || data.updatedAt;
        const time = ts && ts.toDate ? ts.toDate().getTime() : new Date(ts || 0).getTime();
        if (time >= start.getTime() && time <= end.getTime()) {
          results.push(data);
        }
      });
    }
  }

  return results;
};

const pickLatestLocation = (logs) => {
  let latest = null;
  for (const log of logs) {
    const ts = log.timestamp || log.createdAt || log.loggedAt || log.updatedAt;
    const time = ts && ts.toDate ? ts.toDate().getTime() : new Date(ts || 0).getTime();
    if (!latest || time > latest._time) {
      latest = { ...log, _time: time };
    }
  }
  if (!latest) return null;
  delete latest._time;
  return latest;
};

const buildAttendanceMap = (attendanceDocs) => {
  const map = new Map();
  for (const doc of attendanceDocs) map.set(doc.employeeId, doc);
  return map;
};

const buildLocationMap = (locationDocs) => {
  const grouped = locationDocs.reduce((acc, doc) => {
    acc[doc.employeeId] = acc[doc.employeeId] || [];
    acc[doc.employeeId].push(doc);
    return acc;
  }, {});

  const map = new Map();
  for (const [employeeId, logs] of Object.entries(grouped)) {
    map.set(employeeId, pickLatestLocation(logs));
  }
  return map;
};

const getLocationStatus = (employee, locationLog, getDistanceInMeters, defaultRadius) => {
  const assigned = employee.assignedLocation || employee.location || {};
  const lat = assigned.lat ?? assigned.latitude;
  const lng = assigned.lng ?? assigned.longitude;
  const radius = Number(assigned.radiusMeters ?? assigned.radius ?? defaultRadius);

  if (!locationLog || lat == null || lng == null) {
    return {
      status: "not-tracked",
      withinRange: false,
      distanceMeters: null,
      radiusMeters: radius,
      assignedLocation: {
        name: assigned.name || assigned.label || "Assigned Location",
        lat,
        lng,
      },
      employeeLocation: null,
    };
  }

  const distance = getDistanceInMeters(
    locationLog.lat,
    locationLog.lng,
    lat,
    lng
  );
  const withinRange = distance <= radius;

  return {
    status: withinRange ? "within-range" : "out-of-range",
    withinRange,
    distanceMeters: Math.round(distance),
    radiusMeters: radius,
    assignedLocation: {
      name: assigned.name || assigned.label || "Assigned Location",
      lat,
      lng,
    },
    employeeLocation: {
      lat: locationLog.lat,
      lng: locationLog.lng,
      capturedAt: locationLog.timestamp || locationLog.createdAt || locationLog.loggedAt,
    },
  };
};

const summarizeAttendance = (attendanceDocs) => {
  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    "half-day": 0,
  };

  for (const record of attendanceDocs) {
    const status = normalizeStatus(record.status);
    if (status && counts[status] != null) counts[status] += 1;
  }

  return counts;
};

const computeWeeklyTrend = (attendanceDocs, days) => {
  const byDate = {};
  for (const record of attendanceDocs) {
    const status = normalizeStatus(record.status);
    if (!byDate[record.date]) {
      byDate[record.date] = { present: 0, late: 0, absent: 0, "half-day": 0 };
    }
    if (status && byDate[record.date][status] != null) byDate[record.date][status] += 1;
  }

  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const dayStats = byDate[key] || { present: 0, late: 0, absent: 0, "half-day": 0 };
    trend.push({ date: key, ...dayStats });
  }

  return trend;
};

const computeEmployeePerformance = (employees, attendanceDocs) => {
  const byEmployee = new Map();
  for (const record of attendanceDocs) {
    if (!byEmployee.has(record.employeeId)) {
      byEmployee.set(record.employeeId, { present: 0, late: 0, absent: 0, "half-day": 0, total: 0 });
    }
    const summary = byEmployee.get(record.employeeId);
    const status = normalizeStatus(record.status);
    if (status && summary[status] != null) summary[status] += 1;
    summary.total += 1;
  }

  return employees.map((employee) => {
    const summary = byEmployee.get(employee.id) || { present: 0, late: 0, absent: 0, "half-day": 0, total: 0 };
    const attendancePercent = summary.total
      ? Math.round(((summary.present + summary.late + summary["half-day"]) / summary.total) * 100)
      : 0;

    return {
      id: employee.id,
      name: employee.name || employee.fullName || employee.email,
      email: employee.email,
      attendancePercent,
      present: summary.present,
      late: summary.late,
      absent: summary.absent,
      halfDay: summary["half-day"],
      totalDays: summary.total,
    };
  });
};

module.exports = {
  normalizeStatus,
  getAssignedEmployees,
  getAttendanceByDateForEmployees,
  getAttendanceByDateRangeForEmployees,
  getLocationLogsForEmployees,
  buildAttendanceMap,
  buildLocationMap,
  getLocationStatus,
  summarizeAttendance,
  computeWeeklyTrend,
  computeEmployeePerformance,
};
