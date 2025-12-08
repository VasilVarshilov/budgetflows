import { ElectricityInputs, ElectricityResults } from '@/types';

export const calculateElectricity = (inputs: ElectricityInputs): ElectricityResults => {
  const oldT1 = parseFloat(inputs.oldT1);
  const newT1 = parseFloat(inputs.newT1);
  const oldT2 = parseFloat(inputs.oldT2);
  const newT2 = parseFloat(inputs.newT2);
  const priceT1 = parseFloat(inputs.priceT1);
  const priceT2 = parseFloat(inputs.priceT2);
  const invoiceTotal = parseFloat(inputs.invoiceTotal);

  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic numeric validation
  if (
    isNaN(oldT1) || isNaN(newT1) || 
    isNaN(oldT2) || isNaN(newT2) || 
    isNaN(priceT1) || isNaN(priceT2) || 
    isNaN(invoiceTotal)
  ) {
    return {
      consT1: 0,
      consT2: 0,
      totalCons: 0,
      costEm1: 0,
      em2Remainder: 0,
      isValid: false,
      errors: ["Моля, въведете валидни числови стойности."],
      warnings: []
    };
  }

  // Logic validation
  if (newT1 < oldT1) {
    errors.push("Грешка: новото показание Т1 трябва да бъде по-голямо или равно на старото.");
  }
  if (newT2 < oldT2) {
    errors.push("Грешка: новото показание Т2 трябва да бъде по-голямо или равно на старото.");
  }

  if (errors.length > 0) {
    return {
      consT1: 0,
      consT2: 0,
      totalCons: 0,
      costEm1: 0,
      em2Remainder: 0,
      isValid: false,
      errors,
      warnings
    };
  }

  // Calculations
  const consT1 = newT1 - oldT1;
  const consT2 = newT2 - oldT2;
  const totalCons = consT1 + consT2;

  // Prices are already with VAT, so simple multiplication
  const costEm1 = (consT1 * priceT1) + (consT2 * priceT2);
  const em2Remainder = invoiceTotal - costEm1;

  if (em2Remainder < 0) {
    warnings.push("Забележка: Остатъкът е отрицателен – проверете въведените данни или сумата по фактурата.");
  }

  return {
    consT1,
    consT2,
    totalCons,
    costEm1,
    em2Remainder,
    isValid: true,
    errors: [],
    warnings
  };
};
