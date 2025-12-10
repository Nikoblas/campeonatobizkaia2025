import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompetitionExplorerComponent } from './competition-explorer.component';

describe('CompetitionExplorerComponent', () => {
  let component: CompetitionExplorerComponent;
  let fixture: ComponentFixture<CompetitionExplorerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompetitionExplorerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompetitionExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
