export const formatCurrency = (amount: number): string => {
  return amount.toFixed(2);
};

export const formatKWh = (amount: number): string => {
  return amount.toFixed(3);
};

export const getCurrentMonthBulgarian = (): string => {
  const date = new Date();
  const month = date.toLocaleDateString('bg-BG', { month: 'long' });
  const year = date.getFullYear();
  
  // Capitalize first letter of month
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  
  return `${capitalizedMonth} ${year}`;
};
