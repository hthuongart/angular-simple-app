// budget-builder.component.ts
import { Component, signal, computed, effect, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { withInterceptors } from '@angular/common/http';

interface BudgetCell {
  value: number;
  isEditable: boolean;
}

interface BudgetCategory {
  id: string;
  name: string;
  newName: string;
  type: 'income' | 'expense';
  isParent: boolean;
  isNew: boolean;
  cells: BudgetCell[];
  subCategories: BudgetCategory[];
  subTotals: number[];
}

@Component({
  selector: 'budget-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-builder.component.html',
  styleUrls: ['./budget-builder.component.less']
})
export class BudgetBuilderComponent {
  startDate = signal<Date>(new Date(2024, 0));
  endDate = signal<Date>(new Date(2024, 11));
  months = computed(() => this.generateMonths(this.startDate(), this.endDate()));
  focusedCell = signal<{categoryId: string; monthIndex: number} | null>(null);
  contextMenu = signal<{x: number; y: number; category?: BudgetCategory; monthIndex?: number} | null>(null);
  categories = signal<BudgetCategory[] | []>([]);
  @ViewChildren('inputRef') inputs!: QueryList<ElementRef>;
  inputMap = new Map<string, ElementRef>(); // Maps "row,cell" to ElementRef
  
  constructor (){
    // #region Income
    let income = this.createCategory('IMCOME', 'income', true);

    let generalIncome = this.createCategory('General Income', 'income', true);
    let sales = this.createCategory('Sales', 'income', false);
    let comission = this.createCategory('Comission', 'income', false);
    let addNewGeneralIncome = this.createCategory(`Add new ${generalIncome.name} category`, 'income', false, true);
    generalIncome.subCategories = [sales, comission, addNewGeneralIncome];

    let otherIncome = this.createCategory('Other Income', 'income', true);
    let training = this.createCategory('Training', 'income', false);
    let consulting = this.createCategory('Consulting', 'income', false);
    let addNewOtherIncome = this.createCategory(`Add new ${otherIncome.name} category`, 'income', false, true);
    otherIncome.subCategories = [training, consulting, addNewOtherIncome];

    let addNewIncome = this.createCategory(`Add new Parent Category`, 'income', true, true);

    income.subCategories = [generalIncome, otherIncome, addNewIncome];
    // #endRegion

    // #region Expenses
    let expense = this.createCategory('EXPENSES', 'expense', true);

    let operationalExpense = this.createCategory('Operational expense', 'expense', true);
    let management = this.createCategory('Management Fee', 'expense', false);
    let cloudHosting = this.createCategory('Cloud Hosting', 'expense', false);
    let addNewOperationalExpense = this.createCategory(`Add new ${operationalExpense.name} category`, 'expense', false, true);
    operationalExpense.subCategories = [management, cloudHosting, addNewOperationalExpense];

    let salaries = this.createCategory('Other expense', 'expense', true);
    let fulltime = this.createCategory('Fulltime salary', 'expense', false);
    let parttime = this.createCategory('Parttime salary', 'expense', false);
    let addNewSalaries = this.createCategory(`Add new ${salaries.name} category`, 'expense', false, true);
    salaries.subCategories = [fulltime, parttime, addNewSalaries];

    let addNewExpense = this.createCategory(`Add new Parent Category`, 'expense', true, true);

    expense.subCategories = [operationalExpense, salaries, addNewExpense];
    // #endRegion

    this.categories = signal<BudgetCategory[]>([income, expense]);
  }

  ngAfterViewInit() {
    const firstInput = this.inputs.first;
    if (firstInput) {
      firstInput.nativeElement.focus();
    }

    this.buildInputMap();
    this.inputs.changes.subscribe(() => this.buildInputMap());
  }


  private generateMonths(start: Date, end: Date): Date[] {
    const months = [];
    const current = new Date(start);
    while (current <= end) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  }

  private createCategory(name: string, type: 'income' | 'expense', isParent: boolean, isNew: boolean = false): BudgetCategory {
    return {
      id: Math.random().toString(),
      name,
      newName: name,
      type,
      isParent,
      isNew,
      cells: Array.from({ length: this.months().length }, () => ({ value: 0, isEditable: true })),
      subCategories: [],
      subTotals: Array(this.months().length).fill(0),
    };
  }

  get totals() {
    return computed(() => {
      const totals = {
        profitLoss: Array(this.months().length).fill(0),
        openingBalance: Array(this.months().length).fill(0),
        closingBalance: Array(this.months().length).fill(0)
      };

      totals.profitLoss = this.categories()[0].subTotals.map((incomeTotal, i) => incomeTotal -  this.categories()[1].subTotals[i]);
      
      totals.closingBalance = totals.profitLoss.reduce((accumulator, currentItem, i) => {
        accumulator[i] = (accumulator[i-1] || 0) + currentItem;
        return accumulator;
      }, [0]);

      totals.openingBalance = totals.closingBalance.reduce((accumulator, currentItem, i) => {
        accumulator[i] = (totals.closingBalance[i-1] || 0);
        return accumulator;
      }, [0]);

      return totals;
    });
  }

  onCellRightClick(event: MouseEvent, category: BudgetCategory, monthIndex: number) {
    event.preventDefault();
    this.contextMenu.set({ 
      x: event.clientX, 
      y: event.clientY,
      category,
      monthIndex
    });
  }

  onCellChange(categoryInput: BudgetCategory, monthIndex: number) {
    if (categoryInput.isNew) {
      return;
    }

    this.categories.update((cats) => {
      for(let category of cats) {
        for(let subCategory of category.subCategories!) {
          for(let subSubCategory of subCategory.subCategories!) {
            if (subSubCategory.id == categoryInput?.id) {
              subCategory.subTotals[monthIndex] = subCategory.subCategories .filter(c => !c.isNew).reduce((accumulator, currentItem) => {
                return accumulator + currentItem.cells[monthIndex].value;
              }, 0);
  
              category.subTotals[monthIndex] = category.subCategories.filter(c => !c.isNew).reduce((accumulator, currentItem) => {
                return accumulator + currentItem.subTotals[monthIndex];
              }, 0);
  
              break;
            }
          }
        }
      }

      return cats;
    });
  }
  
  applyToAll() {
    const context = this.contextMenu();
    if (!context?.category || context.monthIndex === undefined) return;

    this.categories.update((cats) => {
      for(let category of cats) {
        for(let subCategory of category.subCategories!) {
          for (let subSubCategory of subCategory.subCategories!) {
            if (subSubCategory.id == context?.category?.id!) {
              const value = subSubCategory.cells[context.monthIndex!];
              subSubCategory.cells = subSubCategory.cells.map(() => value) ;

              subCategory.subTotals = subCategory.subTotals.map((_, i) => 
                subCategory.subCategories
                .filter(c => !c.isNew)
                .reduce((sum, cat) => sum + (cat.cells[i].value || 0), 0)
              );

              category.subTotals = category.subTotals.map((_, i) => 
                category.subCategories
                .filter(c => !c.isNew)
                .reduce((sum, cat) => sum + (cat.subTotals[i] || 0), 0)
              );

              return cats;
            }
          }
        }
          
      }
      return cats;
    });

    this.contextMenu.set(null);
  }

  deleteCategory(id: string) {
    this.categories.update((cats) => {
      for(let category of cats) {
        if (category.id == id) {
          cats = cats.filter(cat => cat.id != id);
          return cats;
        }

        for(let subCategory of category.subCategories!) {
          if (subCategory.id == id) {
            category.subCategories = category.subCategories.filter(cat => cat.id == id);
            return cats;
          }

          for (let subSubCategory of subCategory.subCategories!) {
            if (subSubCategory.id == id) {
              subCategory.subCategories = subCategory.subCategories.filter(cat => cat.id != id);

              subCategory.subTotals = subCategory.subTotals.map((_, i) => 
                subCategory.subCategories
                .filter(c => !c.isNew)
                .reduce((sum, cat) => sum + (cat.cells[i].value || 0), 0)
              );

              category.subTotals = category.subTotals.map((_, i) => 
                category.subCategories
                .filter(c => !c.isNew)
                .reduce((sum, cat) => sum + (cat.subTotals[i] || 0), 0)
              );

              return cats;
            }
          }
        }   
      }

      return cats;
    });
  }

  handleCellKey(event: KeyboardEvent, category: BudgetCategory, parentId: string, row: number, cell: number) {
    const key = event.key;
    let newRow = row;
    let newCell = cell;

    switch(event.key) {
      case 'Enter':
        this.addNewCategory(category, parentId);
        break;
      // case 'Tab':
      // case 'ArrowRight':
      //   newCell++; break;
      //   break;
      // case 'ArrowLeft':
      //   newCell--; break;
      //   break;
      // case 'ArrowDown':
      //   newRow++; break;
      //   break;
      // case 'ArrowUp':
      //   newRow--; break;
      //   break;
      }

      // event.preventDefault(); // Prevent default scrolling

      // Check if new position is valid
      // if (this.isValidPosition(newRow, newCell)) {
        this.focusInput(newRow, newCell);
      // }
  }

  // Check if the new row/cell indices are within bounds
  isValidPosition(row: number, cell: number): boolean {
    return (
      row >= 0 &&
      row < this.months.length &&
      cell >= 0 &&
      cell < this.months.length
    );
  }

  // Focus the input at the new position
  focusInput(row: number, cell: number) {
    const input = this.inputMap.get(`${row},${cell}`);
    if (input) {
      input.nativeElement.focus();
    }
  }

  // Build a map of input references using data attributes
  buildInputMap() {
    this.inputMap.clear();
    this.inputs.forEach(input => {
      const row = input.nativeElement.getAttribute('data-row');
      const cell = input.nativeElement.getAttribute('data-cell');
      this.inputMap.set(`${row},${cell}`, input);
    });
  }
    
  
  addNewCategory(category: BudgetCategory, parentId: string) {
    if (!category.isNew) {
      return;
    }

    const newCategory = this.createCategory(category.newName, category.type, category.isParent);

    this.categories.update((cats) => {
      for(let category of cats) {
        if (category.id == parentId) {
          let addNewCategory = category.subCategories.pop();
          category.subCategories.push(newCategory);
          if (addNewCategory) {
            addNewCategory.newName = addNewCategory.name;
            category.subCategories.push(addNewCategory);
          }
          return cats;
        }

        for(let subCategory of category.subCategories) {
          if (subCategory.id == parentId) {
            let addNewCategory = subCategory.subCategories.pop();
            subCategory.subCategories.push(newCategory);
            if (addNewCategory) {
              addNewCategory.newName = addNewCategory.name;
              subCategory.subCategories.push(addNewCategory);
            }
            return cats;
          }
        }
      }
      return cats;
    });

    this.focusedCell.set({ 
      categoryId: newCategory.id, 
      monthIndex: 0 
    });
  }

  handleDateChange(start: HTMLInputElement, end: HTMLInputElement) {
    this.startDate.set(new Date(start.value));
    this.endDate.set(new Date(end.value));
    this.focusedCell.set(null);
  }
}