import { TestBed } from '@angular/core/testing';

import { ScreenRecorderControllerService } from './screen-recorder-controller.service';

describe('ScreenRecorderControllerService', () => {
  let service: ScreenRecorderControllerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScreenRecorderControllerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
