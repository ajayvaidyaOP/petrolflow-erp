import { test, expect, type APIRequestContext } from '@playwright/test';
async function login(request:APIRequestContext,email='owner@sunrisefuels.in') {
  expect((await request.post('/api/v1/auth/login',{data:{email,password:'PetroFlow@2025'}})).ok()).toBeTruthy();
  return (await (await request.get('/api/v1/auth/me')).json()).data;
}

test('billing and void/rebilling never double-post credit sales or stock; concurrent bills cannot share slips',async({request})=>{
  const me=await login(request),stationId=me.stations[0].id;
  const customers=(await (await request.get('/api/v1/catalog/customers')).json()).data;
  const customerId=customers[0].id;
  const a=await request.post('/api/v1/finance/credit-sales',{data:{stationId,customerId,amount:'123.45'}});
  const b=await request.post('/api/v1/finance/credit-sales',{data:{stationId,customerId,amount:'76.55'}});
  expect(a.status()).toBe(201);expect(b.status()).toBe(201);
  const ids=[(await a.json()).data.id,(await b.json()).data.id];
  const balance=async()=>(await (await request.get(`/api/v1/finance/customer-ledger?customerId=${customerId}&stationId=${stationId}`)).json()).data.closingBalance;
  const stock=async()=>(await (await request.get(`/api/v1/inventory/stock?stationId=${stationId}`)).json()).data.tanks;
  const before=await balance(),beforeStock=await stock();
  const today=new Date(Date.now()+330*60000).toISOString().slice(0,10);
  const payload={stationId,customerId,entryIds:ids,billDate:today,dueDate:today,billNumber:`CBTEST-${Date.now()}`};
  const results=await Promise.all([1,2].map(()=>request.post('/api/v1/credit-billing/bills',{data:payload})));
  expect(results.map(r=>r.status()).sort()).toEqual([201,409]);
  const bill=(await results.find(r=>r.status()===201)!.json()).data.id;
  const detail=async()=>(await (await request.get(`/api/v1/credit-billing/bills/${bill}`)).json()).data;
  const issued=await detail();expect(Number(issued.totalAmount)).toBe(200);expect(issued.items).toHaveLength(2);
  expect(issued.customerSnapshot.customer.name).toBeTruthy();
  expect(await balance()).toBe(before);expect(await stock()).toEqual(beforeStock);
  const unbilled=async()=>(await (await request.get(`/api/v1/credit-billing/unbilled?stationId=${stationId}&customerId=${customerId}&pageSize=200`)).json()).data;
  expect((await unbilled()).filter((s:{id:string})=>ids.includes(s.id))).toHaveLength(0);
  expect((await request.post(`/api/v1/credit-billing/bills/${bill}/void`,{data:{reason:'x'}})).status()).toBe(422);
  expect((await request.post(`/api/v1/credit-billing/bills/${bill}/void`,{data:{reason:'Incorrect bill grouping'}})).status()).toBe(200);
  expect((await unbilled()).filter((s:{id:string})=>ids.includes(s.id))).toHaveLength(2);
  expect((await detail()).status).toBe('VOID');expect((await detail()).items).toHaveLength(2);
  const rebill=await request.post('/api/v1/credit-billing/bills',{data:{...payload,billNumber:`RE-${Date.now()}`}});expect(rebill.status()).toBe(201);
  expect(await balance()).toBe(before);expect(await stock()).toEqual(beforeStock);
  expect((await request.post('/api/v1/credit-billing/bills',{data:{...payload,entryIds:[ids[0],ids[0]]}})).status()).toBe(422);
});

test('attendant cannot issue or read credit bills',async({request})=>{
  await login(request,'attendant@sunrisefuels.in');
  expect((await request.post('/api/v1/credit-billing/bills',{data:{}})).status()).toBe(403);
  expect((await request.get('/api/v1/credit-billing/bills?stationId=anything')).status()).toBe(403);
});

test('browser selects unbilled slips and opens a printable consolidated bill',async({page})=>{
  await page.goto('/login');await page.getByLabel('Email').fill('owner@sunrisefuels.in');await page.locator('input[type="password"]').fill('PetroFlow@2025');await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('navigation',{name:'Primary'}).first()).toBeVisible();
  const me=(await (await page.request.get('/api/v1/auth/me')).json()).data,stationId=me.stations[0].id;
  const customerId=(await (await page.request.get('/api/v1/catalog/customers')).json()).data[0].id;
  expect((await page.request.post('/api/v1/finance/credit-sales',{data:{stationId,customerId,amount:'15'}})).status()).toBe(201);
  await page.goto('/credit-billing');await page.getByLabel(/^Customer/).selectOption(customerId);
  await expect(page.locator('main input[type="checkbox"]').first()).toBeVisible();
  await page.locator('main input[type="checkbox"]').first().check();await page.getByRole('button',{name:'Prepare bill',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Bill number').fill(`UIBILL-${Date.now()}`);
  await page.getByRole('dialog').getByRole('button',{name:'Issue credit bill'}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Print / Save PDF'})).toBeVisible();
  await expect(page.locator('#credit-bill-print')).toContainText('Consolidated credit bill');
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#root')).not.toBeVisible();await expect(page.locator('#credit-bill-print')).toBeVisible();
  await page.emulateMedia({media:'screen'});
});
