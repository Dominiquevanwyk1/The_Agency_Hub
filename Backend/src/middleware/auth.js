const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Auth middleware
 * - Reads JWT from Authorization: Bearer <token>
 * - Accepts id / _id / sub from the token
 * - Attaches BOTH _id and id so downstream code is happy
 */
function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || req.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(hdr);
    if (!m) return res.status(401).json({ error: 'Missing token' });

    const payload = jwt.verify(m[1], process.env.JWT_SECRET);

    // Be resilient to various token shapes
    const uid = String(payload.id || payload._id || payload.sub || '');
    if (!uid) return res.status(401).json({ error: 'Invalid token: no subject' });

    const role = payload.role || payload.r || undefined;

    // Important to set BOTH _id and id so existing code that uses either works
    // req.user = { _id: uid, id: uid, role };

    // return next();
    
  // } catch (err) {
  //   return res.status(401).json({ error: 'Invalid or expired token' });
  // }

    return User.findById(uid)
      .select('_id status role disabled isDisabled isActive') 
      .then(user => {
        if (!user) {
          return res.status(401).json({ error: 'Account not found' });
        }

        const status = (user.status || '').toString().toLowerCase();
        const isDisabled = (user.status || '').toLowerCase() !== 'active';

        if (isDisabled) {
          return res.status(403).json({ error: 'Account disabled' });
        }

        req.user = { _id: uid, id: uid, role: role ?? user.role };
        return next();
      })
      .catch(() => res.status(500).json({ error: 'Auth lookup failed' }));

  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Role guard (unchanged)
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { auth, requireRole };