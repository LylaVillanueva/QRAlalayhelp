-- Guardian/official/responder accounts had nowhere to record a home
-- address; the Add User flow now asks for one.
alter table users add column home_address text;
