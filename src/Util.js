'use strict';

const isSameData = (data = {}, dataMatch = {}) => {
  const dataLength = Object.keys(data).length;
  const matches = Object.keys(data)
    .map(key => dataMatch[key] === data[key] || JSON.stringify(dataMatch[key]) === JSON.stringify(data[key]))
    .filter(val => val === true);
  return matches.length === dataLength;
};

module.exports = {
  isSameData,
};
