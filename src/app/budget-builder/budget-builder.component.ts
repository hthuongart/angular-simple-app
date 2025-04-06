// budget-builder.component.ts
import { Component, signal, computed, effect, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { withInterceptors } from '@angular/common/http';
import { RouterLinkWithHref } from '@angular/router';

interface BudgetCell {
  value: number | string;
  isEditable: boolean;
  allowFocus: boolean;
}

interface FocusedCellCoordinates {
  focusedIndex: number
  row: number;
  col: number;
}

interface BudgetCategory {
  id: string;
  name: string;
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
  @ViewChildren('cellInput') cellInputs!: QueryList<ElementRef>;
  startDate = signal<Date>(new Date(2024, 0));
  endDate = signal<Date>(new Date(2024, 11));
  months = computed(() => this.generateMonths(this.startDate(), this.endDate()));
  contextMenu = signal<{x: number; y: number; category?: BudgetCategory; monthIndex?: number} | null>(null);
  categories = signal<BudgetCategory[] | []>([]);
  
  currentRow = 0;
  currentCol = 0;
  
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
    this.focusCurrentCell();

    // To prevent an input's value from changing when scrolling over it
    document.querySelectorAll('input').forEach(input => {
      input.addEventListener('wheel', (e) => {
        e.preventDefault();
      });
    });
  }

  get totals() {
    return computed(() => {
      const totals = {
        profitLoss: Array(this.months().length + 1).fill(0),
        openingBalance: Array(this.months().length + 1).fill(0),
        closingBalance: Array(this.months().length + 1).fill(0)
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

  get navigationMaxtrix() {
    return computed(() => {
      let categories = this.categories();
      let maxtrix: FocusedCellCoordinates[][] = [];
      let row: FocusedCellCoordinates[] = [];
      let focusedIndex = -1;
      let monthsLengh =  this.months().length + 1;
      
      for(let category of categories) {
        for(let subCategory of category.subCategories) {
          row = [];
          let length = subCategory.cells.length;
          length = length > monthsLengh ? monthsLengh : length;
          
          for(let i = 0; i < length; i++) {
            if (subCategory.cells[i].allowFocus) {
              focusedIndex++;
              let focusedCellCoordinates: FocusedCellCoordinates = {
                focusedIndex,
                row: maxtrix.length,
                col: row.length
              }
              row.push(focusedCellCoordinates);
            }
          }

          if (row.length) {
            maxtrix.push(row);
          }

          for(let subSubCategory of subCategory.subCategories) {
            row = [];
            let length = subSubCategory.cells.length;
            length = length > monthsLengh ? monthsLengh : length;

            for(let i = 0; i < length; i++) {
              if (subSubCategory.cells[i].allowFocus) {
                focusedIndex++;
                let focusedCellCoordinates: FocusedCellCoordinates = {
                  focusedIndex,
                  row: maxtrix.length,
                  col: row.length
                }
                row.push(focusedCellCoordinates);
              }
            }
            
            if(row.length) {
              maxtrix.push(row);
            }
          }
        }
      }

      return maxtrix;
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
                return accumulator + Number(currentItem.cells[monthIndex].value);
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

  async onCellKeyDown(event: KeyboardEvent, category: BudgetCategory, parentId: string) {
    let newRow = this.currentRow;
    let newCol = this.currentCol;

    switch(event.key) {
      case 'Enter':
        this.addNewCategory(category, parentId);

        const sleep = (ms: number): Promise<void> => {
          return new Promise(resolve => setTimeout(resolve, ms));
        };

        // Await 200 miniseconds to make sure that the navigationMaxtrix() is updated after categories() is udpated
        await sleep(200);

        // Need to udpate currentRow and currentCol as handling ArrowDown event when a new category is added
        if (this.currentRow < this.navigationMaxtrix().length - 1) {
          newRow++
        }

        if (this.currentCol > this.navigationMaxtrix()[newRow].length) {
          newCol = this.navigationMaxtrix()[newRow].length;
        }

        break;
      case 'Tab':
      case 'ArrowRight':
        event.preventDefault(); // Prevent default scrolling

        if (this.currentCol < this.navigationMaxtrix()[this.currentRow].length - 1) {
          newCol++;
          break;
        } 
        
        if (this.currentRow < this.navigationMaxtrix().length - 1) {
          newRow++;
          newCol = 0;
          break;
        }

        break;
      case 'ArrowLeft':
        event.preventDefault(); // Prevent default scrolling

        if (this.currentCol > 0) {
          newCol--;
          break;
        }
        
        if (this.currentRow > 0) {
          newRow = (this.currentRow > 0) ? this.currentRow - 1 : this.navigationMaxtrix().length - 1;
          newCol = this.navigationMaxtrix()[newRow].length - 1;
          break;
        }

        break;
      case 'ArrowDown':
        event.preventDefault(); // Prevent default scrolling

        if (this.currentRow < this.navigationMaxtrix().length - 1) {
          newRow++
        }

        if (this.currentCol > this.navigationMaxtrix()[newRow].length) {
          newCol = this.navigationMaxtrix()[newRow].length;
        }
        break;
      case 'ArrowUp':
        event.preventDefault(); // Prevent default scrolling

        if (this.currentRow > 0) {
          newRow--;
        } 

        if (this.currentCol > this.navigationMaxtrix()[newRow].length) {
          newCol = this.navigationMaxtrix()[newRow].length;
        }
        break;
    }

    // Ensure new position is valid
    if (newRow >= 0 && newRow < this.navigationMaxtrix().length) {
      if (newCol >  this.navigationMaxtrix()[newRow].length - 1) {
        newCol = this.navigationMaxtrix()[newRow].length - 1;
      }

      if (newCol >= 0) {
        this.currentRow = newRow;
        this.currentCol = newCol;
        this.focusCurrentCell();
      }
    } 
  }

  async onDateChange(start: HTMLInputElement, end: HTMLInputElement) {
    this.startDate.set(new Date(start.value));
    this.endDate.set(new Date(end.value));
    this.currentRow = 0;
    this.currentCol = 0;
    this.focusCurrentCell();
  }

  // Update currentRow and currentCol when an input is focused
  onCellFocus() {
    let focusedIndex = this.getFocusedInputIndex();
    if (focusedIndex === null) {
      return;
    }

    for(let row of this.navigationMaxtrix()) {
      for(let col of row) {
        if (col.focusedIndex == focusedIndex) {
          this.currentRow = col.row;
          this.currentCol = col.col;
          return;
        }
      }
    }
  }
  
  applyToAll() {
    const context = this.contextMenu();
    if (!context?.category || context.monthIndex === undefined) return;

    this.categories.update((cats) => {
      for(let category of cats) {
        for(let subCategory of category.subCategories!) {
          for (let subSubCategory of subCategory.subCategories!) {
            if (subSubCategory.id == context?.category?.id!) {
              const touchedCell = subSubCategory.cells[context.monthIndex!];

              subSubCategory.cells = subSubCategory.cells.map((cell, i) => {
                // Won't override for the first cell (category name)
                if (!i) {
                  return cell;
                }

                // Deep clone to avoid reference
                const touchedCellClone: BudgetCell = {
                  value: touchedCell.value,
                  isEditable: touchedCell.isEditable,
                  allowFocus: touchedCell.allowFocus
                }

                return touchedCellClone;
              });

              subCategory.subTotals = subCategory.subTotals.map((_, i) =>
                subCategory.subCategories
                .filter(c => !c.isNew)
                .reduce((sum, cat) => sum + Number(cat.cells[i].value || 0), 0)
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
                .reduce((sum, cat) => sum + Number((cat.cells[i].value || 0)), 0)
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
   
  
  private addNewCategory(currentCategory: BudgetCategory, parentId: string) {
    if (!currentCategory.isNew) {
      return;
    }

    const addedCategory = this.createCategory(currentCategory.cells[0].value.toString(), currentCategory.type, currentCategory.isParent);

    this.categories.update((cats) => {
      for(let category of cats) {
        if (category.id == parentId) {
          // Add newSubCategory for the category has been add
          let addNewSubCategory = this.createCategory(`Add new ${addedCategory.name} category`, category.type, false, true);
          addedCategory.subCategories.push(addNewSubCategory);

          let addNewCategory = category.subCategories.pop();
          category.subCategories.push(addedCategory);
          
          // Update the displayed value of addNewCategory to original name after it's edited by typing
          if (addNewCategory) {
            addNewCategory.cells[0].value = currentCategory.name;
            category.subCategories.push(addNewCategory);
          }
          return cats;
        }

        for(let subCategory of category.subCategories) {
          if (subCategory.id == parentId) {
            let addNewCategory = subCategory.subCategories.pop();
            subCategory.subCategories.push(addedCategory);

             // Update the displayed value of addNewCategory to original name after it's edited by typing
            if (addNewCategory) {
              addNewCategory.cells[0].value = currentCategory.name;
              subCategory.subCategories.push(addNewCategory);
            }
            return cats;
          }
        }
      }
      return cats;
    });
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
    // category name column
    const cells: any[] = [{ value: name, isEditable: isNew, allowFocus: isNew }];
    const MAX_MONTH_LENGTH = 12;

    if (!isParent && !isNew) {
      // monthly columns
      const moreCells: any[] = Array.from({ length: MAX_MONTH_LENGTH }, () => ({ value: 0, isEditable: true, allowFocus: true }));
      cells.push(...moreCells);
    }

    return {
      id: Math.random().toString(),
      name,
      type,
      isParent,
      isNew,
      cells: cells,
      subCategories: [],
      subTotals: Array(MAX_MONTH_LENGTH + 1).fill(0)
    };
  }

  // Method to check which input is focused
  private getFocusedInputIndex(): number | null {
    const activeElement = document.activeElement; // Get the currently focused element

    // Convert QueryList to an array of native elements
    const cellInputs = this.cellInputs.toArray();

    // Find the index of the focused input
    for (let i = 0; i < cellInputs.length; i++) {
      if (cellInputs[i].nativeElement === activeElement) {
        return i; // Return the index if found
      }
    }

    return null; // No input is focused
  }

  private focusCurrentCell() {
    // Calculate focused index based on 2D position
    let focusedIndex = 0;
    let maxtrix = this.navigationMaxtrix();

    for (let i = 0; i < this.currentRow; i++) {
      focusedIndex += maxtrix[i].length;
    }

    focusedIndex += this.currentCol;

    const inputs = this.cellInputs.toArray();
    if (inputs[focusedIndex]) {
      inputs[focusedIndex].nativeElement.focus();
    }
  }
}