import { TestBed } from '@angular/core/testing';

import { ScreenRecorderService } from './screen-recorder.service';

describe('ScreenRecorderService', () => {
  let service: ScreenRecorderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScreenRecorderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
