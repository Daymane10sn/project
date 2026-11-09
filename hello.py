n = int(input())
l = []
for i in range(n):
    a = int(input())
    l.append(a)
for i in range(n):
    for j in range(n-1):
        if l[j] > l[j + 1]:
            l[j],l[j+1] = l[j + 1],l[j]
print(l)