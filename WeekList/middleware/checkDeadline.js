const checkDeadline = (req, res, next) => {
    const { weekList } = req;
    const currentTime = new Date();
  
    if (weekList.activeUntil <= currentTime) {
      return res.status(403).json({ error: 'Forbidden - Deadline passed. Cannot mark/unmark weeklist.' });
    }
  
    next();
  };
  
  module.exports = checkDeadline;
  
