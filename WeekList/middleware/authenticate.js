const jwt = require('jsonwebtoken');
const dotenv = require('dotenv')
dotenv.config()

const authenticate = (req, res, next) => {
  const {token} = req.headers;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized - Missing token' });
  }

  try {
    req.userId = jwt.verify(token, process.env.JWT_TOKEN).userId;
    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

module.exports = authenticate;
