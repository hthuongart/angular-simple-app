import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BudgetBuilderComponent } from './budget-builder.component';

describe('BudgetBuilderComponent', () => {
  let component: BudgetBuilderComponent;
  let fixture: ComponentFixture<BudgetBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BudgetBuilderComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(BudgetBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
