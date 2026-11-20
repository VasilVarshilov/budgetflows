import { ElectricityInputs, ElectricityResults } from '@/types';
import { parseDecimalInput } from './formatting';

export const calculateElectricity = (inputs: ElectricityInputs): ElectricityResults => {
  const oldT1 = parseDecimalInput(inputs.oldT1);
  const newT1 = parseDecimalInput(inputs.newT1);
  const oldT2 = parseDecimalInput(inputs.oldT2);
  const newT2 = parseDecimalInput(inputs.newT2);
  const priceT1 = parseDecimalInput(inputs.priceT1);
  const priceT2 = parseDecimalInput(inputs.priceT2);
  const invoiceTotal = parseDecimalInput(inputs.invoiceTotal);

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

/**
 * Single-meter electricity calculation (T1 Day + T2 Night tariffs).
 * Calculates CONS_T1, CONS_T2, TOTAL_CONS_EM1, and COST_EM1 only.
 * Does NOT calculate EM2_REMAINDER or require invoiceTotal.
 */
export const calculateSingleMeterElectricity = (
  inputs: ElectricityInputs
): ElectricityResults => {
  const oldT1 = parseDecimalInput(inputs.oldT1);
  const newT1 = parseDecimalInput(inputs.newT1);
  const oldT2 = parseDecimalInput(inputs.oldT2);
  const newT2 = parseDecimalInput(inputs.newT2);
  const priceT1 = parseDecimalInput(inputs.priceT1);
  const priceT2 = parseDecimalInput(inputs.priceT2);

  const errors: string[] = [];

  if (
    isNaN(oldT1) || isNaN(newT1) ||
    isNaN(oldT2) || isNaN(newT2) ||
    isNaN(priceT1) || isNaN(priceT2)
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
      warnings: []
    };
  }

  const consT1 = newT1 - oldT1;
  const consT2 = newT2 - oldT2;
  const totalCons = consT1 + consT2;
  const costEm1 = (consT1 * priceT1) + (consT2 * priceT2);

  return {
    consT1,
    consT2,
    totalCons,
    costEm1,
    em2Remainder: 0,
    isValid: true,
    errors: [],
    warnings: []
  };
};
