# Investment Portfolio Tracker

W przeciwieństwie do innych moich aplikacji, ta aplikacja jest w całości po polsku (UI jak i README), ponieważ jest dedykowana dla polskiego prawa podatkowego (m.in. podatek Belki, formularze PIT, rozliczenia w PLN). 


## Podsumowanie:

## Zyski i Podatki:

### Kupony z obligacji kupionych na giełdzie:
Aby automatycznie dodać i policzyć zysk z kuponów z obligacji kupionych na giełdzie nalezy dodać transakcje w zakładce Obligacje. Zysk i podatek z kuponu zostaną dodane do zakładki zyski w dniu wypłaty kuponu lub poźniej, jak tylko aplikacja zostanie włączona po dacie wypłaty kuponu.

Sposób automatycznego liczenia podatków:


### Akcje:
Zyski z akcji nalezy dodać ręcznie na podstawie PIT8-C lub raportu podatkowego brokera.
Zysk z obligacji skarbowych moze byc automatycznie obliczony i dodany na podstawie zaimportowanego pliku CSV:

Aplikacja podpowiada i przypomina o istotnych aspektach w zaleznosci od typu dodawanego zysku, np.:

*Przy wpisywaniu zysku z obligacji skarbowych krajowych:

„Pamiętaj by uwzględnić zamianę obligacji i wykup obligacji które zapadły”

*Przy wpisywaniu zysku z obligacji korporacyjnych:

„Pamiętaj aby uwzględnić opłaty transakcyjne i ewentualne straty”

*Przy wpisywaniu zysku z obligacji skarbowych krajowych wyświetla się instrukcja importu historii z serwisu transakcyjnego obligacji:

 "Zaloguj się do serwisu transakcyjnego obligacji, wybierz Historia Dyspozycji i w zakresie historii wybierz dany rok rozliczeniowy. Następnie (na dole strony) kliknij Eksport do arkusza MS Excel. Otwórz pobrany plik w Excel lub Numbers i eksportuj jako CSV."

  "Pamiętaj, aby w końcowej kwocie uwzględnić zamianę obligacji i wykup obligacji, które zapadły."

## Akcje:

### Lista obserwowanych:
Lista podzielona jest na 2 segmenty: spółki posiadane w porfelu (dodają się automatycznie do listy jeśli dodamy spółke do portfela w głównym ekranie akcji) i spółki dodane do listy ręcznie - po tickerze. Lista pobiera dane z czasu rzeczywistego korzystając z nieoficjalnej biblioteki do API Yahoo Finance:
nazwę spółki, logo spółki (ze strony financialmodelingprep.com) cena za akcję, dzienna zmiana procentowa, wskaźnik PE oraz wskaźnik PEG.

Po kliknieciu w spółkę mamy dostęp

Przycisk Otwórz w Yahoo przekierowuje do strony Yahoo dla danej spółki z otwartą tabelką historycznych wartości wskaźników finansowych. 

## Dziennik:

Miejsce na refleksję nad swoimi transakcjami, szczególnie przydatny dla traderów, ale równie dobrze sprawdza się przy inwestowaniu.

Na samej górze zawiera losowy cytat znanego inwestora/analityka (m.in. Warren Buffet, Charlie Munger, Benjamin Graham, Peter Lynch, john Murphy, i inni), który zmienia się przy kazdym wejsciu w zakładkę dziennika.

Uzyj + aby dodać nowy wpis, gdzie piszemy dlaczego kupiłem, dlaczego sprzedałem, % zysku lub straty, ocenę tej transakcji i co mogłem zrobić lepiej. Mozemy dodać takze screenshot naszej analizy techniczej. Kazdy wpis mozna edytować i usunąć.

Uzyj ? aby dodać tam swoją strategię inwestycyjną, do której zawsze mozna wrócić, by sprawdzić, czy nasza transakcja była zgodna ze strategią, czy moze była wynikiem emocji.


## Instalacja:

Pobierz repozytorium. W terminalu w folderze aplikacji:

`npm install`

Aby uruchomić aplikację:

`npm start`

### Czasem jest problem z node. To moze pomóc:

1. Usuń wpis blokujący/zezwalający na skrypty z package.json
`npm pkg delete allowScripts`

2. Wyczyść ukryte zmienne środowiskowe, które mogłyby blokować pobieranie binarne
`unset ELECTRON_SKIP_BINARY_DOWNLOAD
npm config delete electron_skip_binary_download`

3. Usuń te pliki
`rm -rf node_modules package-lock.json`

4. Pobierz najnowszą wersję Electrona (zaktualizuje to wersję w package.json)
`npm install electron@latest --save-dev`

5. Zainstaluj resztę aplikacji (np. bazę SQLite3)
`npm install`

6. Przebuduj SQLite pod architekturę Maca
`npm rebuild sqlite3`

7. Uruchom
`npm start`